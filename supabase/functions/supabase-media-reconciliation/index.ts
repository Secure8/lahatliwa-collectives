import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import {
  BUCKET,
  classifyStorageObject,
  collectReferencePaths,
  normalizeProjectMediaPath,
} from '../process-storage-cleanup/reconciliation.js';

const PAGE_SIZE = 100;
const MAX_OBJECTS = 1000;
const MAX_FOLDERS = 500;
const REFERENCE_TABLES = ['projects', 'creative_members', 'site_settings', 'page_content', 'service_branches', 'media_assets', 'admin_users'];
const safeError = (error: unknown) => {
  const value = error as { code?: string; message?: string } | null;
  return {
    code: value?.code || 'SUPABASE_RECONCILIATION_FAILED',
    message: value?.message || 'Supabase reconciliation failed.',
  };
};

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
  const normalized = ['supabase', BUCKET, type, String(value || '').trim()].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${type}:${hash}`;
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
    const [references, inventory, ledgerResult] = await Promise.all([
      collectReferences(actor.admin),
      listObjects(actor.admin),
      actor.admin.from('external_media_objects').select('id,bucket,storage_path,status', { count: 'exact' })
        .eq('provider', 'supabase').neq('status', 'deleted').limit(1000),
    ]);
    if (ledgerResult.error) throw ledgerResult.error;
    const ledger = ledgerResult.data || [];
    const ledgerTruncated = Number(ledgerResult.count || 0) > 1000;
    const objectsByPath = new Map(inventory.objects.map((item: any) => [normalizeProjectMediaPath(item.path), item]));
    const ledgerPaths = new Set(ledger.map((row: any) => normalizeProjectMediaPath(row.storage_path)).filter(Boolean));
    const monitoredReferences = new Set([...references, ...ledgerPaths]);
    const findings: any[] = [];

    for (const row of ledger) {
      const path = normalizeProjectMediaPath(row.storage_path);
      if (!path) {
        findings.push({
          finding_identity: await findingIdentity('unclassified-source', String(row.id)),
          finding_type: 'unclassified_provider_object', provider: 'supabase', severity: 'manual_review',
          media_object_id: row.id, status: 'manual_review', recheck_after: recheckAfter, details: { recordedSource: true },
        });
        continue;
      }
      if (row.bucket === BUCKET && !objectsByPath.has(path)) {
        findings.push({
          finding_identity: await findingIdentity('missing-source', path), finding_type: 'missing_supabase_source',
          provider: 'supabase', severity: 'critical', media_object_id: row.id,
          recheck_after: recheckAfter, details: {},
        });
      }
    }

    for (const object of inventory.objects) {
      const classification = classifyStorageObject(object, monitoredReferences);
      const path = normalizeProjectMediaPath(object.path);
      const extension = path.split('.').pop()?.toLowerCase() || '';
      if (classification.classification === 'invalid' || !['jpg','jpeg','png','webp'].includes(extension)) {
        findings.push({
          finding_identity: await findingIdentity('unclassified-object', object.path), finding_type: 'unclassified_provider_object',
          provider: 'supabase', severity: 'manual_review', status: 'manual_review', recheck_after: recheckAfter,
          details: { sizeBytes: object.size },
        });
      } else if (classification.classification === 'confirmed_orphan' && !ledgerTruncated) {
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
      manualReview: findings.filter((item) => item.status === 'manual_review').length,
      truncated: inventory.truncated || ledgerTruncated,
    };
    await actor.admin.from('storage_reconciliation_runs').update({
      status: 'completed', scanned_records: ledger.length, scanned_objects: inventory.objects.length,
      finding_count: findings.length, summary, completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return { runId: run.id, summary, findings: findings.length };
  } catch (error) {
    const failure = safeError(error);
    await actor.admin.from('storage_reconciliation_runs').update({
      status: 'failed', error_code: failure.code,
      error_message: String(failure.message).slice(0, 500), completed_at: new Date().toISOString(),
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
  catch (error) { return fail(safeError(error).code, 'Supabase media reconciliation failed without deleting any objects.', 500, cors); }
});
