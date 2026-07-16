import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { budgetStatus, evaluateStorageBudget } from '../../supabase/functions/_shared/storageGovernance.js';

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

test('project and creative creation use server drafts before every new-record media upload', () => {
  const project = source('src/components/admin/ProjectForm.jsx');
  const creative = source('src/pages/admin/CreativeEditor.jsx');
  const edge = source('supabase/functions/r2-media/index.ts');
  assert.match(project, /if \(!mediaProjectId\) mediaProjectId = await ensureProjectMediaDraft\(\)/);
  assert.match(project, /await ensureProjectMediaDraft\(\)[\s\S]*uploadCoverImage/);
  assert.match(creative, /if\(!targetId\)\{const draft=await createPublicMediaDraft\('creative'/);
  assert.match(edge, /crypto\.randomUUID\(\)/);
  assert.match(edge, /media_creation_state: 'incomplete'/);
});

test('ordinary public uploads remain R2-only with no silent Supabase fallback', () => {
  for (const path of ['src/lib/storage.js', 'src/lib/contentApi.js', 'src/lib/profileExternalStorage.js']) {
    const implementation = source(path);
    assert.match(implementation, /uploadManagedWebsiteImage/);
    assert.doesNotMatch(implementation, /storage\.from\([^)]*\)\.upload/);
  }
  assert.match(source('src/lib/r2Media.js'), /R2_UPLOAD_UNAVAILABLE/);
  assert.match(source('supabase/functions/r2-media/index.ts'), /Existing images were not changed/);
});

test('reservations use server policy, reconcile trusted provider bytes, and release after failures', () => {
  const edge = source('supabase/functions/r2-media/index.ts');
  assert.match(edge, /reserve_public_media_bytes/);
  assert.match(edge, /signedR2Request\(fetch, cfg, 'HEAD'/);
  assert.match(edge, /trusted_size_bytes: row\.verifiedBytes/);
  assert.match(edge, /p_success: true/);
  assert.match(edge, /p_success: false/);
});

test('Supabase monitoring compares the live ledger and inventory without deleting objects', () => {
  const reconciliation = source('supabase/functions/supabase-media-reconciliation/index.ts');
  assert.match(reconciliation, /external_media_objects/);
  assert.match(reconciliation, /missing_supabase_source/);
  assert.match(reconciliation, /orphaned_supabase_object/);
  assert.match(reconciliation, /storage_reconciliation_findings/);
  assert.doesNotMatch(reconciliation, /storage_migrations|migration_id|retention_overdue/);
  assert.doesNotMatch(reconciliation, /storage\.from\(BUCKET\)\.remove|deleteR2Object/);
});

test('cleanup preserves retired migration sources while normal provider cleanup remains active', () => {
  const worker = source('supabase/functions/process-storage-cleanup/index.ts');
  assert.match(worker, /MIGRATION_CLEANUP_RETIRED/);
  assert.doesNotMatch(worker, /queueExpiredMigrationSources|retained_for_rollback|queued_for_source_deletion/);
  assert.doesNotMatch(worker, /from\('storage_migrations'\)/);
  assert.match(worker, /admin\.storage\.from\(job\.bucket_name\)\.remove/);
  assert.match(worker, /deleteR2Object/);
});

test('governance exposes monitoring and policy only, with no migration execution actions', () => {
  const edge = source('supabase/functions/storage-governance/index.ts');
  const retirement = source('supabase/migrations/20260717170000_retire_public_media_migration.sql');
  assert.match(edge, /actor\.role!=='super_admin'/);
  assert.match(edge, /get_storage_governance_snapshot/);
  assert.match(edge, /get_provider_storage_usage/);
  assert.doesNotMatch(edge, /safeMigration|list_migrations|inspect_migration|retry_migration|pause_migration|resume_migration/);
  assert.match(retirement, /drop function if exists public\.claim_one_public_media_migration/);
  assert.match(retirement, /drop function if exists public\.activate_public_media_migration/);
  assert.match(retirement, /source preserved/);
});

test('emergency fallback remains explicit, expiring, one-time, super-admin-only, and audited', () => {
  const governance = source('supabase/functions/storage-governance/index.ts');
  const fallback = source('supabase/functions/emergency-public-media-upload/index.ts');
  assert.match(governance, /emergency_supabase_fallback_enabled/);
  assert.match(governance, /expires_at:new Date\(Date\.now\(\)\+10\*60\*1000\)/);
  assert.match(fallback, /actor\.role!=='super_admin'/);
  assert.match(fallback, /status:'used'/);
});

test('legacy public references still render through provider-neutral URL resolution', () => {
  const storage = source('src/lib/storage.js');
  const content = source('src/lib/contentApi.js');
  assert.match(storage, /getPublicImageUrl/);
  assert.match(storage, /supabase\.storage\.from\(BUCKET\)\.getPublicUrl/);
  assert.match(content, /resolvePublicAssetUrl/);
});
