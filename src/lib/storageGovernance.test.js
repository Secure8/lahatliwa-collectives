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

test('server project media drafts pass the ownership guard without weakening browser inserts', () => {
  const migration = source('supabase/migrations/20260813170000_allow_server_project_media_drafts.sql');
  assert.match(migration, /auth\.role\(\) = 'service_role'/);
  assert.match(migration, /new\.media_creation_state is distinct from 'incomplete'/);
  assert.match(migration, /new\.slug is distinct from 'draft-' \|\| new\.id::text/);
  assert.match(migration, /not private\.can_create_project\(new\.owner_user_id\)/);
  assert.match(migration, /auth\.uid\(\) is null or not private\.can_create_project\(auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on function private\.guard_project_ownership\(\) from public, anon, authenticated/i);
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

test('storage reference scans protect Website Studio media and revision history', () => {
  for (const path of [
    'supabase/functions/process-storage-cleanup/index.ts',
    'supabase/functions/supabase-media-reconciliation/index.ts',
    'supabase/functions/r2-media/index.ts',
  ]) {
    const implementation = source(path);
    assert.match(implementation, /website_studio_entries/);
    assert.match(implementation, /website_studio_revisions/);
  }
});

test('cleanup preserves retired migration sources while normal provider cleanup remains active', () => {
  const worker = source('supabase/functions/process-storage-cleanup/index.ts');
  assert.match(worker, /MIGRATION_CLEANUP_RETIRED/);
  assert.doesNotMatch(worker, /queueExpiredMigrationSources|retained_for_rollback|queued_for_source_deletion/);
  assert.doesNotMatch(worker, /from\('storage_migrations'\)/);
  assert.match(worker, /admin\.storage\.from\(job\.bucket_name\)\.remove/);
  assert.match(worker, /deleteR2Object/);
});

test('cleanup scheduler stores the complete Edge Function endpoint', () => {
  const bootstrap = source('supabase/storage_cleanup_cron_bootstrap.sql');
  assert.match(bootstrap, /p_project_url \|\| '\/functions\/v1\/process-storage-cleanup'/);
  assert.match(bootstrap, /vault\.create_secret\(v_worker_url/);
  assert.match(bootstrap, /vault\.update_secret\(v_id,v_worker_url/);
});

test('retired storage dashboards do not remain callable while R2 policy stays intact', () => {
  const retirement = source('supabase/migrations/20260814160000_role_lifecycle_and_storage_retirement.sql');
  assert.match(retirement, /drop function if exists public\.get_provider_storage_usage/);
  assert.match(retirement, /drop function if exists public\.get_storage_governance_snapshot/);
  assert.match(retirement, /emergency_supabase_fallback_enabled=false/);
  assert.match(source('supabase/functions/r2-media/index.ts'), /evaluate_public_media_budget/);
});

test('legacy media migration execution remains retired', () => {
  const retirement = source('supabase/migrations/20260717170000_retire_public_media_migration.sql');
  assert.match(retirement, /drop function if exists public\.claim_one_public_media_migration/);
  assert.match(retirement, /drop function if exists public\.activate_public_media_migration/);
  assert.match(retirement, /source preserved/);
});

test('member lifecycle migration qualifies project ownership references', () => {
  const migration = source('supabase/migrations/20260814160000_role_lifecycle_and_storage_retirement.sql');
  assert.match(migration, /v_project_id uuid/);
  assert.match(migration, /where pc\.project_id=v_project_id/);
  assert.doesNotMatch(migration, /project_creatives\.project_id=project_id/);
});

test('R2 budget checks validate their actor and operation context', () => {
  const migration = source('supabase/migrations/20260814170000_public_media_budget_parameter_validation.sql');
  assert.match(migration, /p_actor_user_id is null/);
  assert.match(migration, /nullif\(trim\(coalesce\(p_operation_kind,''\)\),''\) is null/);
  assert.match(migration, /provider='cloudflare_r2'/);
});

test('legacy public references still render through provider-neutral URL resolution', () => {
  const storage = source('src/lib/storage.js');
  const content = source('src/lib/contentApi.js');
  assert.match(storage, /getPublicImageUrl/);
  assert.match(storage, /supabase\.storage\.from\(BUCKET\)\.getPublicUrl/);
  assert.match(content, /resolvePublicAssetUrl/);
});
