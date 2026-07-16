import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import {
  BUCKET,
  classifyStorageObject,
  collectReferencePaths,
  normalizeProjectMediaPath,
} from '../process-storage-cleanup/reconciliation.js';
import { migrationIdentity } from '../_shared/storageGovernance.js';

const PAGE_SIZE = 100;
const MAX_OBJECTS = 1000;
const MAX_FOLDERS = 500;
const REFERENCE_TABLES = ['projects', 'creative_members', 'site_settings', 'page_content', 'service_branches', 'media_assets', 'admin_users'];

async function collectReferences(admin: any) {
  const results = await Promise.all(REFERENCE_TABLES.map((table) => admin.from(table).select('*', { count: 'exact' }).limit(1000)));
  const failure = results.find((result: any) => result.error);
  if (failure) throw Object.assign(new Error('A public-reference source could not be scanned.'), { code: 'REFERENCE_SCAN_FAILED' });
  if (results.some((result: any) => Number(result.count || 0) > 1000)) {
    throw Object.assign(new Error('A public-reference source exceeded the bounded reconciliation scan.'), { code: 'REFERENCE_SCAN_TRUNCATED' });
  }
  return collectReferencePaths(...results.map((result: any) => result.data || []));
}

async function listObjects(admin: any) {
  const folders = [''];
  const visited = new Set<string>();
  const objects: any[] = [];
  let truncated = false;
  while (folders.length && objects.length < MAX_OBJECTS) {
    const folder = folders.shift() || '';
    if (visited.has(folder)) continue;
    visited.add(folder);
    if (visited.size > MAX_FOLDERS) { truncated = true; break; }
    for (let offset = 0; objects.length < MAX_OBJECTS; offset += PAGE_SIZE) {
      const { data, error } = await admin.storage.from(BUCKET).list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw Object.assign(new Error('Supabase media inventory could not be listed.'), { code: 'SUPABASE_LIST_FAILED' });
      for (const item of data || []) {
        const path = folder ? `${folder}/${item.name}` : item.name;
        if (!item.id && !item.metadata) folders.push(path);
        else objects.push({ path, created_at: item.created_at, size: Number(item.metadata?.size || 0) || null });
        if (objects.length >= MAX_OBJECTS) { truncated = true; break; }
      }
      if ((data || []).length < PAGE_SIZE) break;
    }
  }
  return { objects, truncated };
}

async function findingIdentity(type: string, value: string) {
  return `${type}:${await migrationIdentity({ provider: 'supabase', bucket: BUCKET, path: value })}`;
}

async function reconcile(actor: any) {
  const { data: policy } = await actor.admin.from('storage_policies').select('reconciliation_recheck_hours').eq('singleton', true).single();
  const recheckAfter = new Date(Date.now() + Number(policy?.reconciliation_recheck_hours || 24) * 3600000).toISOString();
  const { data: run, error: runError } = await actor.admin.from('storage_reconciliation_runs').insert({
    requested_by: actor.user.id,
    status: 'running',
    provider_scope: ['supabase'],
  }).select('id').single();
  if (runError) throw runError;

  try {
    const [references, inventory, migrationResult] = await Promise.all([
      collectReferences(actor.admin),
      listObjects(actor.admin),
      actor.admin.from('storage_migrations').select('id,status,source_bucket,source_path,retain_source_until,source_media_object_id', { count: 'exact' }).eq('source_provider', 'supabase').eq('destination_provider', 'cloudflare_r2').limit(1000),
    ]);
    if (migrationResult.error) throw migrationResult.error;
    const migrations = migrationResult.data || [];
    const migrationTruncated = Number(migrationResult.count || 0) > 1000;
    const objectsByPath = new Map(inventory.objects.map((item: any) => [normalizeProjectMediaPath(item.path), item]));
    const retainedPaths = new Set(migrations.filter((row: any) => !['completed','cancelled','rolled_back'].includes(row.status)).map((row: any) => normalizeProjectMediaPath(row.source_path)).filter(Boolean));
    const findings: any[] = [];

    for (const migration of migrations) {
      const path = normalizeProjectMediaPath(migration.source_path);
      if (!path) {
        findings.push({
          finding_identity: await findingIdentity('unclassified-source', String(migration.id)),
          finding_type: 'unclassified_provider_object', provider: 'supabase', severity: 'manual_review',
          migration_id: migration.id, status: 'manual_review', recheck_after: recheckAfter, details: { recordedSource: true },
        });
        continue;
      }
      if (!objectsByPath.has(path) && !['completed','cancelled','rolled_back'].includes(migration.status)) {
        findings.push({
          finding_identity: await findingIdentity('missing-source', path), finding_type: 'missing_supabase_source',
          provider: 'supabase', severity: 'critical', migration_id: migration.id,
          media_object_id: migration.source_media_object_id, recheck_after: recheckAfter, details: {},
        });
      }
      if (migration.status === 'retained_for_rollback' && Date.parse(migration.retain_source_until || '') <= Date.now()) {
        findings.push({
          finding_identity: await findingIdentity('retention-overdue', path), finding_type: 'retention_overdue',
          provider: 'supabase', severity: 'warning', migration_id: migration.id,
          media_object_id: migration.source_media_object_id, recheck_after: recheckAfter, details: {},
        });
      }
    }

    for (const object of inventory.objects) {
      const classification = classifyStorageObject(object, references);
      const path = normalizeProjectMediaPath(object.path);
      const extension = path.split('.').pop()?.toLowerCase() || '';
      if (classification.classification === 'invalid' || !['jpg','jpeg','png','webp'].includes(extension)) {
        findings.push({
          finding_identity: await findingIdentity('unclassified-object', object.path), finding_type: 'unclassified_provider_object',
          provider: 'supabase', severity: 'manual_review', status: 'manual_review', recheck_after: recheckAfter,
          details: { sizeBytes: object.size },
        });
      } else if (classification.classification === 'confirmed_orphan' && !migrationTruncated && !retainedPaths.has(path)) {
        findings.push({
          finding_identity: await findingIdentity('orphan-object', path), finding_type: 'orphaned_supabase_object',
          provider: 'supabase', severity: 'warning', recheck_after: recheckAfter, details: { sizeBytes: object.size },
        });
      }
    }

    if (findings.length) {
      const { error } = await actor.admin.from('storage_reconciliation_findings').insert(findings.map((item) => ({ ...item, run_id: run.id })));
      if (error) throw error;
    }
    await actor.admin.from('external_media_objects').update({ last_reconciled_at: new Date().toISOString() }).eq('provider', 'supabase');
    const summary = {
      missing: findings.filter((item) => item.finding_type === 'missing_supabase_source').length,
      orphaned: findings.filter((item) => item.finding_type === 'orphaned_supabase_object').length,
      retentionOverdue: findings.filter((item) => item.finding_type === 'retention_overdue').length,
      manualReview: findings.filter((item) => item.status === 'manual_review').length,
      truncated: inventory.truncated || migrationTruncated,
    };
    await actor.admin.from('storage_reconciliation_runs').update({
      status: 'completed', scanned_records: migrations.length, scanned_objects: inventory.objects.length,
      finding_count: findings.length, summary, completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return { runId: run.id, summary, findings: findings.length };
  } catch (error) {
    await actor.admin.from('storage_reconciliation_runs').update({
      status: 'failed', error_code: error?.code || 'SUPABASE_RECONCILIATION_FAILED',
      error_message: String(error?.message || 'Supabase reconciliation failed.').slice(0, 500), completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    throw error;
  }
}

Deno.serve(async (request) => {
  const env = edgeEnvironment();
  const cors = corsHeaders(request, env.siteOrigin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  const actor = await authenticatedTeamMember(request, env);
  if ('error' in actor || actor.role !== 'super_admin') return fail('NOT_AUTHORIZED', 'Only the Super Admin can run provider reconciliation.', 403, cors);
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'reconcile') return fail('ACTION_NOT_ALLOWED', 'The requested reconciliation action is unavailable.', 400, cors);
  try { return reply({ success: true, result: await reconcile(actor) }, 200, cors); }
  catch (error) { return fail(error?.code || 'SUPABASE_RECONCILIATION_FAILED', 'Supabase media reconciliation failed without deleting any objects.', 500, cors); }
});
