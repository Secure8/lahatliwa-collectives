import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), 'utf8');

const signatures = [
  'save_editorial_revision\\(uuid,jsonb,text,text,text,uuid,jsonb\\)',
  'submit_editorial_post\\(uuid\\)',
  'start_editorial_revision\\(uuid\\)',
  'request_editorial_changes\\(uuid,text\\)',
  'approve_editorial_post\\(uuid,text\\)',
  'schedule_editorial_post\\(uuid,timestamptz\\)',
  'publish_editorial_post\\(uuid\\)',
  'archive_editorial_post\\(uuid,text\\)',
  'restore_editorial_revision\\(uuid,uuid\\)',
  'restore_archived_editorial_post\\(uuid\\)',
];

test('additive migration grants only authenticated direct access to capability-checked Editorial RPCs', async () => {
  const migration = await source('supabase/migrations/20260720130000_restore_editorial_authenticated_rpc_execution.sql');
  for (const signature of signatures) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public,anon,authenticated,service_role`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to authenticated`, 'i'));
  }
  assert.match(migration, /revoke all on function public\.execute_editorial_action_as_service\(uuid,text,jsonb\) from public,anon,authenticated,service_role/i);
  assert.match(migration, /grant execute on function public\.execute_editorial_action_as_service\(uuid,text,jsonb\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute[^;]+to (?:anon|public)/i);
  assert.doesNotMatch(migration, /alter table|create policy|drop policy|update public\.editorial_|delete from public\.editorial_|insert into public\.editorial_/i);
});

test('authenticated Editorial RPCs retain internal authorization and protected workflow-field enforcement', async () => {
  const [foundation, restore, api] = await Promise.all([
    source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql'),
    source('supabase/migrations/20260720090000_restore_archived_editorial_post.sql'),
    source('src/features/editorial/editorialApi.js'),
  ]);
  assert.match(foundation, /private\.has_editorial_capability\(auth\.uid\(\),'manage_all'\)/);
  assert.match(foundation, /v_post\.author_user_id=auth\.uid\(\)/);
  assert.match(foundation, /v_post\.assigned_editor_user_id=auth\.uid\(\)/);
  assert.match(foundation, /guard_editorial_post_workflow_fields/);
  assert.match(restore, /private\.has_editorial_capability\(auth\.uid\(\),\s*'manage_settings'\)/);
  assert.match(api, /functions\.invoke\('editorial-workflow'/);
  assert.doesNotMatch(api, /rpc\('save_editorial_revision'/);
});
