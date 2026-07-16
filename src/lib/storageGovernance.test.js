import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  budgetStatus,
  classifyStorageState,
  evaluateStorageBudget,
  migrationIdentity,
  shouldRecheckFinding,
  sourceCleanupEligible,
  validateLegacyImageSource,
} from '../../supabase/functions/_shared/storageGovernance.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const MiB = 1024 * 1024;

test('budget thresholds distinguish information, warnings, restrictions, pauses, and blocks', () => {
  assert.equal(budgetStatus(59.9), 'normal');
  assert.equal(budgetStatus(60), 'information');
  assert.equal(budgetStatus(75), 'warning');
  assert.equal(budgetStatus(85), 'strong_warning');
  assert.equal(budgetStatus(90), 'restricted');
  assert.equal(budgetStatus(95), 'paused');
  assert.equal(budgetStatus(100), 'blocked');
});

test('pre-upload policy blocks non-admins and requires an explicit audited super-admin override', () => {
  const common = { activeBytes: 94 * MiB, proposedBytes: 4 * MiB, reserveBytes: 2 * MiB, budgetBytes: 100 * MiB };
  assert.equal(evaluateStorageBudget({ ...common, role: 'creative' }).code, 'STORAGE_BUDGET_EXHAUSTED');
  assert.equal(evaluateStorageBudget({ ...common, role: 'super_admin', override: true, overrideReason: 'short' }).allowed, false);
  const override = evaluateStorageBudget({ ...common, role: 'super_admin', override: true, overrideReason: 'Emergency publication' });
  assert.equal(override.allowed, true);
  assert.equal(override.overrideAccepted, true);
});

test('legacy migration accepts only classified image bytes and routes unknown objects to review', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
  assert.equal(validateLegacyImageSource({ path: 'projects/a.jpg', mimeType: 'image/jpeg', sizeBytes: 4, signature: jpeg }).eligible, true);
  assert.equal(validateLegacyImageSource({ path: 'archive/source.psd', mimeType: 'application/octet-stream', sizeBytes: 4, signature: jpeg }).eligible, false);
  assert.equal(validateLegacyImageSource({ path: 'projects/a.jpg', mimeType: 'image/jpeg', sizeBytes: 4, signature: new Uint8Array(4) }).reason, 'signature_mismatch');
});

test('migration identity is stable per source reference and changes for a different record', async () => {
  const input = { provider: 'supabase', bucket: 'project-media', path: 'projects/a.jpg', recordType: 'project', recordId: 'one', field: 'cover_image' };
  assert.equal(await migrationIdentity(input), await migrationIdentity({ ...input }));
  assert.notEqual(await migrationIdentity(input), await migrationIdentity({ ...input, recordId: 'two' }));
});

test('retained source cleanup is allowed only after retention and after active references disappear', () => {
  const migration = { status: 'retained_for_rollback', retain_source_until: '2026-01-01T00:00:00Z' };
  assert.equal(sourceCleanupEligible(migration, { now: Date.parse('2026-02-01T00:00:00Z'), sourceStillReferenced: false }), true);
  assert.equal(sourceCleanupEligible(migration, { now: Date.parse('2026-02-01T00:00:00Z'), sourceStillReferenced: true }), false);
  assert.equal(shouldRecheckFinding({ status: 'detected', recheck_after: '2026-01-01T00:00:00Z' }, Date.parse('2026-02-01T00:00:00Z')), true);
});

test('storage-state classification separates active, retained, provisional, failed, cleanup, and deleted records', () => {
  assert.equal(classifyStorageState({ provider: 'cloudflare_r2', status: 'available' }), 'active_r2');
  assert.equal(classifyStorageState({ provider: 'supabase', status: 'available' }), 'active_supabase_legacy');
  assert.equal(classifyStorageState({ accounting_state: 'provisional', status: 'uploading' }), 'provisional_upload');
  assert.equal(classifyStorageState({ status: 'available' }, { status: 'retained_for_rollback' }), 'migrated_with_retained_source');
  assert.equal(classifyStorageState({ status: 'deleted' }), 'successfully_deleted');
});

test('project and creative creation use server drafts before every new-record save or initial media upload', () => {
  const project = source('src/components/admin/ProjectForm.jsx');
  const creative = source('src/pages/admin/CreativeEditor.jsx');
  const edge = source('supabase/functions/r2-media/index.ts');
  assert.match(project, /if \(!mediaProjectId\) mediaProjectId = await ensureProjectMediaDraft\(\)/);
  assert.match(project, /await ensureProjectMediaDraft\(\)[\s\S]*uploadCoverImage/);
  assert.match(creative, /if\(!targetId\)\{const draft=await createPublicMediaDraft\('creative'/);
  assert.match(creative, /const draft=await createPublicMediaDraft\('creative'[\s\S]*uploadProfileWebsiteMedia/);
  assert.match(edge, /crypto\.randomUUID\(\)/);
  assert.match(edge, /media_creation_state: 'incomplete'/);
});

test('ordinary public upload modules contain no silent Supabase upload fallback', () => {
  for (const path of ['src/lib/storage.js', 'src/lib/contentApi.js', 'src/lib/profileExternalStorage.js']) {
    const implementation = source(path);
    assert.match(implementation, /uploadManagedWebsiteImage/);
    assert.doesNotMatch(implementation, /storage\.from\([^)]*\)\.upload/);
  }
  assert.match(source('src/lib/r2Media.js'), /R2_UPLOAD_UNAVAILABLE/);
  assert.match(source('supabase/functions/r2-media/index.ts'), /Existing images were not changed/);
});

test('reservations use server policy, reconcile trusted HEAD bytes, and release after failures', () => {
  const edge = source('supabase/functions/r2-media/index.ts');
  const sql = source('supabase/migrations/20260716140000_public_media_governance.sql');
  assert.match(edge, /reserve_public_media_bytes/);
  assert.match(edge, /signedR2Request\(fetch, cfg, 'HEAD'/);
  assert.match(edge, /trusted_size_bytes: row\.verifiedBytes/);
  assert.match(edge, /p_success: true/);
  assert.match(edge, /p_success: false/);
  assert.match(sql, /storage_reservation_override/);
});

test('migration is one-record, browser-split, locked, idempotent, verifies all variants, and retains the source', () => {
  const migration = source('supabase/functions/public-media-migration/index.ts');
  const originalSql = source('supabase/migrations/20260716140000_public_media_governance.sql');
  const sql = source('supabase/migrations/20260717140000_browser_public_media_migration.sql');
  assert.match(originalSql, /storage_migrations_identity_idx/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /locked_at < now\(\)-interval '15 minutes'/);
  assert.match(migration, /migrationIdentity/);
  assert.match(migration, /action === 'prepare_one'/);
  assert.match(migration, /action === 'authorize_variants'/);
  assert.match(migration, /action === 'finalize_one'/);
  assert.match(sql, /status='retained_for_rollback'/);
  assert.match(migration, /R2_MIGRATION_VERIFICATION_FAILED/);
  assert.doesNotMatch(migration, /process_batch|createServerWebsiteDerivatives|imagemagick/i);
});

test('reconciliation detects missing and orphaned provider objects without deleting them', () => {
  const r2 = source('supabase/functions/public-media-migration/index.ts');
  const legacy = source('supabase/functions/supabase-media-reconciliation/index.ts');
  assert.match(r2, /missing_r2_object/);
  assert.match(r2, /orphaned_r2_object/);
  assert.match(legacy, /missing_supabase_source/);
  assert.match(legacy, /orphaned_supabase_object/);
  assert.match(legacy, /storage_reconciliation_findings/);
  assert.doesNotMatch(legacy, /storage\.from\(BUCKET\)\.remove|deleteR2Object/);
});

test('retention cleanup rechecks references and only the provider-aware worker performs deletion', () => {
  const worker = source('supabase/functions/process-storage-cleanup/index.ts');
  assert.match(worker, /references\.has\(normalizeProjectMediaPath\(migration\.source_path\)\)/);
  assert.match(worker, /retained_for_rollback/);
  assert.match(worker, /queued_for_source_deletion/);
  assert.match(worker, /admin\.storage\.from\(job\.bucket_name\)\.remove/);
  assert.match(worker, /deleteR2Object/);
});

test('governance operations are server-authorized, RLS-protected, aggregated server-side, and redact object keys', () => {
  const edge = source('supabase/functions/storage-governance/index.ts');
  const sql = source('supabase/migrations/20260716140000_public_media_governance.sql');
  assert.match(edge, /actor\.role!=='super_admin'/);
  assert.match(edge, /safeMigration/);
  assert.doesNotMatch(edge.match(/function safeMigration[\s\S]*?\}\n/)?.[0] || '', /external_file_id|destination_key/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /private\.is_active_super_admin\(auth\.uid\(\)\)/);
  assert.match(sql, /get_storage_governance_snapshot/);
  assert.match(sql, /storage_usage_by_owner/);
  assert.match(sql, /storage_usage_by_project/);
  assert.match(sql, /storage_usage_by_creative/);
});

test('emergency fallback is explicit, expiring, one-time, super-admin-only, and audited', () => {
  const governance = source('supabase/functions/storage-governance/index.ts');
  const fallback = source('supabase/functions/emergency-public-media-upload/index.ts');
  assert.match(governance, /emergency_supabase_fallback_enabled/);
  assert.match(governance, /expires_at:new Date\(Date\.now\(\)\+10\*60\*1000\)/);
  assert.match(fallback, /actor\.role!=='super_admin'/);
  assert.match(fallback, /\.eq\('status','authorized'\)/);
  assert.match(fallback, /status:'used'/);
  assert.match(fallback, /emergency_supabase_fallback_used/);
});

test('legacy public references still render through provider-neutral URL resolution', () => {
  const storage = source('src/lib/storage.js');
  const content = source('src/lib/contentApi.js');
  assert.match(storage, /getPublicImageUrl/);
  assert.match(storage, /supabase\.storage\.from\(BUCKET\)\.getPublicUrl/);
  assert.match(content, /resolvePublicAssetUrl/);
  assert.match(content, /getPublicUrl/);
});
