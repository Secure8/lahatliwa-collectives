import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storage = readFileSync(new URL('../pages/admin/Storage.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('./storageGovernance.js', import.meta.url), 'utf8');
const governance = readFileSync(new URL('../../supabase/functions/storage-governance/index.ts', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../../supabase/functions/_shared/providerStorageUsage.js', import.meta.url), 'utf8');
const providerSql = readFileSync(new URL('../../supabase/migrations/20260717180000_transparent_provider_storage_usage.sql', import.meta.url), 'utf8');
const adminLayout = readFileSync(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

test('provider cards share one equal-height two-column structure that collapses to one mobile column', () => {
  assert.match(storage, /data-provider-grid[^>]+grid min-w-0 items-start gap-4 lg:auto-rows-\[18rem\] lg:grid-cols-2/);
  assert.match(storage, /ProviderCard key=\{provider\.name\}/);
  assert.match(storage, /data-provider-card[^>]+grid h-full min-h-\[18rem\]/);
  assert.match(storage, /grid-rows-\[2\.5rem_minmax\(7rem,1fr\)_auto_1\.25rem\]/);
  assert.match(storage, /lg:min-h-0 lg:self-stretch/);
  assert.match(storage, /grid auto-rows-fr grid-cols-2/);
  assert.match(styles, /\.grid > \.admin-surface \+ \.admin-surface,[\s\S]*?margin-top:\s*0/);
  assert.doesNotMatch(storage, /overflow-x-auto|whitespace-nowrap.*ProviderCard/);
});

test('provider loading cards reserve the same desktop row height as their completed cards', () => {
  assert.match(storage, /data-provider-loading[^>]+lg:auto-rows-\[18rem\] lg:grid-cols-2/);
  assert.match(storage, /h-full min-h-\[18rem\] animate-pulse/);
});

test('Storage shows only cost-control usage information and omits provider diagnostics', () => {
  assert.match(storage, />Storage usage</);
  assert.match(storage, />Used</);
  assert.match(storage, /Plan limit/);
  assert.match(storage, /Upload limit/);
  assert.match(storage, /label="Remaining"/);
  assert.match(storage, />Updated /);
  assert.match(storage, />R2 upload limit</);
  assert.doesNotMatch(storage, /Reading details|Objects counted|Buckets|Pages scanned|Calculation source|Missing size|Invalid size|Objects scanned before failure/);
  assert.doesNotMatch(storage, /Provider monitoring and health|Cleanup and reconciliation status|Storage policy summary/);
  assert.doesNotMatch(storage, /Connection overview|OperationsOverview/);
});

test('Supabase usage uses the confirmed one-gigabyte plan limit without adding new-upload controls', () => {
  assert.match(storage, /name: 'Supabase Storage'.*limitBytes: 1024 \*\* 3.*limitLabel: 'Plan limit'/);
  assert.doesNotMatch(storage, /Supabase budget|Supabase upload limit/);
});

test('R2 exposes one editable upload limit that controls the remaining-space display', () => {
  assert.match(storage, /name: 'Cloudflare R2'.*limitBytes: budgetBytes.*limitLabel: 'Upload limit'/);
  assert.match(storage, /New uploads stop at this limit to help control storage costs/);
  assert.match(storage, /updateStoragePolicy\(\{ budget_bytes:/);
});

test('provider readings fail closed and Refresh requests a fresh no-cache reading', () => {
  assert.match(storage, /reading\.available === true && reading\.complete === true/);
  assert.match(storage, /usedBytes == null \? 'Unavailable' : formatBytes\(usedBytes\)/);
  assert.match(storage, /requestInFlight\.current/);
  assert.match(storage, /snapshot: null, error: error\.message/);
  assert.match(storage, /load\(\{ forceRefresh: true \}\)/);
  assert.match(client, /forceRefresh/);
  assert.match(governance, /cache:'no-store'/);
});

test('monitoring uses provider sources rather than substituting the Lahat Liwa ledger', () => {
  assert.match(providerSql, /from storage\.objects objects/);
  assert.match(providerSql, /from storage\.buckets buckets/);
  assert.doesNotMatch(providerSql, /external_media_objects/);
  assert.match(governance, /readR2BucketUsage\(fetch,config\)/);
  assert.match(provider, /listR2Objects/);
  assert.match(storage, /providerUsage\.r2/);
  assert.match(storage, /providerUsage\.supabase/);
});

test('Storage preserves retired migration and recent-media removals', () => {
  assert.doesNotMatch(storage, /Recent public media|MediaPreviewGallery|mediaPreviews|<img/);
  assert.doesNotMatch(storage, /migration_paused|migration_retention_days|Rollback days|Migrate one|Resume migration|Pause migration|Process queue/);
  assert.doesNotMatch(client, /public-media-migration|prepare_one|resume_migration|pause_migration|retry_migration/);
  assert.doesNotMatch(governance, /storage_migrations|list_migrations|inspect_migration|retry_migration/);
});

test('Storage keeps the committed brand palette, top navigation, and responsive spacing', () => {
  assert.match(storage, /bg-\[#090a0d\]/);
  assert.match(storage, /from-amber-300 to-orange-400/);
  assert.doesNotMatch(storage, /radial-gradient/);
  assert.doesNotMatch(storage, /(?:blue|cyan|teal|violet)-/);
  assert.match(storage, /grid gap-6/);
  assert.match(adminLayout, /data-admin-mobile-top-navigation/);
  assert.match(adminLayout, /fixed inset-x-0 top-0/);
  assert.doesNotMatch(storage, /bottom-nav|data-admin-mobile-bottom/);
});

test('Storage includes balanced loading, wrapping, and unavailable states without fake visuals', () => {
  assert.match(storage, /data-provider-loading/);
  assert.match(storage, /animate-pulse/);
  assert.match(storage, /break-words/);
  assert.match(storage, /Unavailable/);
  assert.doesNotMatch(storage, /fake|uptime|trend|decorative capacity/i);
  assert.doesNotMatch(storage, /background-image:linear-gradient|background-size:32px/);
});
