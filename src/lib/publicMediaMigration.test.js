import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const edge = source('supabase/functions/public-media-migration/index.ts');
const uploadEdge = source('supabase/functions/r2-media-upload/index.ts');
const client = source('src/lib/storageGovernance.js');
const image = source('src/lib/imageCompression.js');
const governance = source('supabase/functions/storage-governance/index.ts');
const sql = source('supabase/migrations/20260717140000_browser_public_media_migration.sql');

test('production Edge migration no longer bundles ImageMagick or server transformation', () => {
  assert.doesNotMatch(edge, /imagemagick|magick-wasm|migrationImage|createServerWebsiteDerivatives/i);
  assert.doesNotMatch(source('supabase/functions/_shared/r2Media.js'), /imagemagick|magick-wasm/i);
});

test('prepare claims exactly one record and stale tasks become recoverable', () => {
  assert.match(sql, /for update skip locked limit 1/);
  assert.match(sql, /task_expires_at is not null and task_expires_at < now\(\)/);
  assert.match(sql, /migration_phase='recoverable'/);
  assert.doesNotMatch(edge, /process_batch/);
});

test('retry preserves stable destination identity and does not expose object keys', () => {
  assert.match(edge, /migration\.destination_media_group_id/);
  assert.match(edge, /knownGroups/);
  assert.match(edge, /prepared\.map\(\(\{ mediaId, variant \}\)/);
  assert.doesNotMatch(edge.match(/return \{ claimed: 1, task:[\s\S]*?\n  \} catch/)?.[0] || '', /objectKey:/);
});

test('short-lived task authorization is hashed, actor-bound, expiring, and single-use', () => {
  assert.match(edge, /TASK_TTL_MS = 8 \* 60 \* 1000/);
  assert.match(edge, /task_token_hash: await sha256\(token\)/);
  assert.match(edge, /task_actor_user_id !== actor\.user\.id/);
  assert.match(edge, /MIGRATION_TASK_EXPIRED/);
  assert.match(edge, /MIGRATION_TASK_CONSUMED/);
  assert.match(sql, /task_token_hash is null or task_token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  const browserGrant = sql.match(/grant select \([\s\S]*?\) on table public\.storage_migrations to authenticated/)?.[0] || '';
  assert.doesNotMatch(browserGrant, /task_token_hash|prepared_objects|prepared_source_reference|source_path/);
});

test('migration upload reuses the authenticated R2 proxy with a record-bound task', () => {
  assert.match(uploadEdge, /row\.migration_id !== migrationId/);
  assert.match(uploadEdge, /destination_media_group_id === groupId/);
  assert.match(uploadEdge, /constantEqual\(String\(migration\?\.task_token_hash/);
  assert.doesNotMatch(client, /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|external_file_id|objectKey/);
});

test('browser uses the established three variants sequentially and never starts a second record', () => {
  assert.match(image, /thumbnail: \{ maxBytes: 350 \* 1024, maxDimension: 640/);
  assert.match(image, /display: \{ maxBytes: 1_200 \* 1024, maxDimension: 1800/);
  assert.match(image, /expanded: \{ maxBytes: 2_500 \* 1024, maxDimension: 2800/);
  assert.match(client, /for \(let index = 0; index < task\.uploads\.length; index \+= 1\)/);
  assert.equal((client.match(/action: 'prepare_one'/g) || []).length, 1);
});

test('browser safeguards reject SVG, animation, MIME mismatch, and unsafe dimensions', () => {
  assert.match(image, /\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
  assert.match(image, /chunks\.includes\('ANIM'\).*chunks\.includes\('ANMF'\)/);
  assert.match(image, /imageSignature\(header\) !== file\.type/);
  assert.match(image, /width \* height > maxPixels/);
  assert.match(image, /URL\.revokeObjectURL/);
});

test('finalize trusts provider HEAD only after all three rows exist and activates atomically', () => {
  assert.match(edge, /signedR2Request\(fetch, cfg, 'HEAD'/);
  assert.match(edge, /rows\.length !== 3/);
  assert.match(edge, /size !== Number\(row\.size_bytes\)/);
  assert.match(edge, /activate_public_media_migration/);
  assert.match(sql, /Exactly three provider-verified variants are required/);
  assert.match(sql, /where id=m\.source_record_id and cover_image=old_reference/);
});

test('failures release reservations, preserve the source, and leave provisional objects recorded', () => {
  assert.match(edge, /p_success: false/);
  assert.match(edge, /accounting_state: 'provisional'/);
  assert.match(edge, /sourcePreserved: true/);
  assert.doesNotMatch(edge, /deleteR2Object|storage\.from\([^)]*\)\.remove/);
});

test('reconciliation classifies expired tasks, stale locks, and partial groups without deleting', () => {
  assert.match(edge, /expired-task:/);
  assert.match(edge, /stale-lock:/);
  assert.match(edge, /partial-group:/);
  assert.match(edge, /uploaded-not-finalized:/);
  assert.doesNotMatch(edge, /deleteR2Object/);
});

test('governance retry accepts stale or recoverable records without direct database editing', () => {
  assert.match(governance, /row\.migration_phase!=='recoverable'&&!stale/);
  assert.match(governance, /migration_phase:'recoverable'/);
  assert.match(governance, /task_token_hash:null/);
});
