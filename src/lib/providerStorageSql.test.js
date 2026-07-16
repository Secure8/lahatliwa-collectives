import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../../supabase/migrations/20260717180000_transparent_provider_storage_usage.sql', import.meta.url), 'utf8');

test('Supabase usage includes every bucket and current live object row without using the application ledger', () => {
  assert.match(sql, /from storage\.buckets buckets\s+left join object_sizes/);
  assert.match(sql, /from storage\.objects objects/);
  assert.match(sql, /pg_catalog\.count\(object_sizes\.id\)/);
  assert.doesNotMatch(sql, /external_media_objects|storage_migrations/);
});

test('Supabase usage accepts numeric and string sizes while separating missing and invalid metadata', () => {
  assert.match(sql, /jsonb_typeof\(objects\.metadata->'size'\) in \('number', 'string'\)/);
  assert.match(sql, /then 'missing'/);
  assert.match(sql, /then 'usable'/);
  assert.match(sql, /else 'invalid'/);
  assert.match(sql, /objectsWithUsableSize/);
  assert.match(sql, /objectsMissingSize/);
  assert.match(sql, /objectsInvalidSize/);
  assert.doesNotMatch(sql, /else 0/);
});

test('Supabase usage returns per-bucket totals, an empty-project-safe aggregate, and an honest completeness flag', () => {
  assert.match(sql, /coalesce\(pg_catalog\.sum\(bucket_usage\.total_bytes\), 0\)/);
  assert.match(sql, /'bucketCount'/);
  assert.match(sql, /'buckets'/);
  assert.match(sql, /'complete', project_usage\.objects_missing_size = 0 and project_usage\.objects_invalid_size = 0/);
  assert.match(sql, /'source', 'current_storage_objects_in_this_project'/);
  assert.match(sql, /'checkedAt'/);
});

test('Supabase provider usage remains read-only and service-role-only', () => {
  assert.match(sql, /auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /revoke all on function public\.get_provider_storage_usage\(\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.get_provider_storage_usage\(\) to service_role/);
  assert.doesNotMatch(sql, /insert into storage|update storage|delete from storage/i);
});
