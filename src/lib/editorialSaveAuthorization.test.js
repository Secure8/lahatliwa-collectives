import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Save Draft authorization is null-safe when no editor is assigned', () => {
  const migration = source('supabase/migrations/20260720150000_harden_editorial_save_authorization.sql');
  assert.match(migration, /v_post\.id is null/);
  assert.match(migration, /not coalesce\(private\.has_editorial_capability[\s\S]+assigned_editor_user_id=auth\.uid\(\),false\)/);
  assert.match(migration, /raise exception 'EDITORIAL_NOT_AUTHORIZED'/);
  assert.doesNotMatch(migration, /insert into public\.editorial_posts/);
  assert.doesNotMatch(migration, /delete from public\.editorial/);
});
test('hardened Save Draft keeps the exact role grants and protected workflow update', () => {
  const migration = source('supabase/migrations/20260720150000_harden_editorial_save_authorization.sql');
  assert.match(migration, /revoke all on function public\.save_editorial_revision\(uuid,jsonb,text,text,text,uuid,jsonb\) from public,anon,service_role/);
  assert.match(migration, /grant execute on function public\.save_editorial_revision\(uuid,jsonb,text,text,text,uuid,jsonb\) to authenticated/);
  assert.match(migration, /set_config\('app\.editorial_workflow','1',true\)/);
  assert.match(migration, /EDITORIAL_REVISION_CONFLICT/);
  assert.match(migration, /private\.valid_editorial_document/);
});
