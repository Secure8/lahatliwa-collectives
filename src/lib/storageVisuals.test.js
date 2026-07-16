import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storage = readFileSync(new URL('../pages/admin/Storage.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('./storageGovernance.js', import.meta.url), 'utf8');
const governance = readFileSync(new URL('../../supabase/functions/storage-governance/index.ts', import.meta.url), 'utf8');
const providerSql = readFileSync(new URL('../../supabase/migrations/20260717160000_provider_storage_usage.sql', import.meta.url), 'utf8');

test('storage monitoring visualizes only real provider and ledger data', () => {
  assert.match(storage, /ProviderCard/);
  assert.match(storage, /Provider health/);
  assert.match(storage, /R2 bucket usage/);
  assert.match(storage, /role="img" aria-label=\{usedPercent/);
  assert.match(storage, /represented in the Lahat Liwa ledger/);
  assert.doesNotMatch(storage, /fake|uptime|trend/i);
});

test('provider totals are authoritative and distinct from application ledger totals', () => {
  assert.match(providerSql, /from storage\.objects/);
  assert.match(providerSql, /metadata->>'size'/);
  assert.match(providerSql, /auth\.role\(\) <> 'service_role'/);
  assert.doesNotMatch(providerSql, /insert into storage|update storage|delete from storage/i);
  assert.match(governance, /readR2BucketUsage\(fetch,config\)/);
  assert.match(governance, /get_provider_storage_usage/);
  assert.match(governance, /providerUsage/);
  assert.match(storage, /Provider total/);
  assert.match(storage, /Lahat Liwa ledger/);
  assert.match(storage, /All Storage buckets/);
});

test('existing Supabase media is monitored without an automatic migration feature', () => {
  assert.match(storage, /Existing Supabase media/);
  assert.match(storage, /not automatically moved to R2/);
  assert.match(storage, /Automatic movement/);
  assert.doesNotMatch(storage, /migration_paused|migration_retention_days|Rollback days|Migrate one|Resume migration|Pause migration|Process queue/);
  assert.doesNotMatch(client, /public-media-migration|prepare_one|resume_migration|pause_migration|retry_migration/);
  assert.doesNotMatch(governance, /storage_migrations|list_migrations|inspect_migration|retry_migration/);
});

test('monitoring does not request or render recent public media', () => {
  assert.doesNotMatch(storage, /Recent public media|MediaPreviewGallery|mediaPreviews|<img/);
  assert.doesNotMatch(governance, /publicMediaPreviews|mediaPreviews|getPublicUrl/);
});

test('monitoring follows the committed admin visual system', () => {
  assert.match(storage, /rounded-2xl border border-white\/\[0\.1\] bg-\[#090a0d\]/);
  assert.match(storage, /from-amber-300 to-orange-400/);
  assert.doesNotMatch(storage, /storage-policy-banner|storage-feature-card|storage-provider-card/);
});

test('monitoring background has no decorative grid pattern', () => {
  assert.doesNotMatch(storage, /background-image:linear-gradient|background-size:32px/);
});
