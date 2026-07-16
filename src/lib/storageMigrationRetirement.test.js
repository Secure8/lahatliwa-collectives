import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

test('the Supabase-to-R2 migration runtime and browser probe are removed', () => {
  assert.equal(exists('supabase/functions/public-media-migration/index.ts'), false);
  assert.equal(exists('supabase/functions/_shared/sourceImageProbe.js'), false);
  assert.equal(exists('supabase/functions/_shared/sourceImageProbe.test.js'), false);
  assert.doesNotMatch(source('supabase/config.toml'), /functions\.public-media-migration/);
  assert.doesNotMatch(source('src/lib/storageFeatureFlags.js'), /storageMigrationEnabled/);
});

test('active upload and governance functions contain no migration execution path', () => {
  const upload = source('supabase/functions/r2-media-upload/index.ts');
  const governance = source('supabase/functions/storage-governance/index.ts');
  assert.doesNotMatch(upload, /migrationId|migrationToken|storage_migrations|MIGRATION_TASK/);
  assert.doesNotMatch(governance, /storage_migrations|safeMigration|pause_migration|resume_migration|list_migrations|inspect_migration|retry_migration/);
  assert.match(upload, /authenticated_edge_proxy_v1/);
  assert.match(governance, /get_provider_storage_usage/);
});

test('retirement migration disables tasks and preserves source files', () => {
  const sql = source('supabase/migrations/20260717170000_retire_public_media_migration.sql');
  assert.match(sql, /migration_paused = true/);
  assert.match(sql, /last_error_code = 'MIGRATION_RETIRED'/);
  assert.match(sql, /MIGRATION_CLEANUP_RETIRED: source preserved/);
  assert.match(sql, /drop function if exists public\.claim_one_public_media_migration/);
  assert.match(sql, /drop function if exists public\.activate_public_media_migration/);
  assert.doesNotMatch(sql, /delete from|drop table|storage\.objects/);
  assert.equal(exists('supabase/migrations/20260716140000_public_media_governance.sql'), true);
  assert.equal(exists('supabase/migrations/20260717140000_browser_public_media_migration.sql'), true);
});

test('monitoring remains provider-authoritative and independent from migration tables', () => {
  const usage = source('supabase/functions/_shared/providerStorageUsage.js');
  const reconciliation = source('supabase/functions/supabase-media-reconciliation/index.ts');
  const page = source('src/pages/admin/Storage.jsx');
  assert.match(usage, /listR2Objects/);
  assert.match(reconciliation, /external_media_objects/);
  assert.match(reconciliation, /missing_supabase_source/);
  assert.doesNotMatch(reconciliation, /storage_migrations|migration_id/);
  assert.match(page, /Storage usage/);
  assert.match(page, /Existing public media stays in Supabase/);
  assert.doesNotMatch(page, /migration_paused|migration_retention_days|Rollback days/);
});
