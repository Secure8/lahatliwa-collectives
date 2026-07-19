import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const migration = source('supabase/migrations/20260720170000_editorial_owner_workspace_autonomy.sql');
const foundation = source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql');
const studio = source('src/pages/editorial/EditorialStudio.jsx');
const api = source('src/features/editorial/editorialApi.js');
const team = source('src/pages/admin/AdminTeam.jsx');

test('multi-role assignments are additive, constrained, and Super Admin protected', () => {
  assert.match(migration, /add column if not exists editorial_roles text\[\] not null default/);
  assert.match(migration, /editorial_roles <@ array\['creative','writer','editor'\]/);
  assert.match(migration, /SUPER_ADMIN_REQUIRED/);
  assert.match(team, /Additional roles/);
  assert.match(team, /EDITORIAL_ASSIGNABLE_ROLES\.map/);
});

test('private workspace reads are author-only except for Super Admin', () => {
  assert.match(migration, /editorial_posts_team_read[\s\S]+manage_all'[\s\S]+author_user_id=auth\.uid\(\)/);
  assert.doesNotMatch(migration.match(/create policy editorial_posts_team_read[^;]+;/)?.[0] || '', /assigned_editor_user_id/);
  assert.match(api, /!\['super_admin', 'owner'\]\.includes[\s\S]+author_user_id/);
});

test('owner lifecycle includes direct publish, archive, restore, and permanent delete', () => {
  for (const functionName of ['publish_editorial_post', 'archive_editorial_post', 'restore_archived_editorial_post', 'delete_editorial_post']) {
    assert.match(migration, new RegExp(`function public\\.${functionName}`));
  }
  assert.match(migration, /delete from public\.editorial_posts where id=p_post_id/);
  assert.match(migration, /'delete',v_post\.status,null/);
  assert.match(foundation, /post_id uuid references public\.editorial_posts\(id\) on delete set null/);
  assert.match(studio, /title: 'Delete story\?'/);
  assert.match(studio, /This cannot be undone/);
});

test('legacy review actions cannot cross account boundaries', () => {
  assert.match(migration, /function private\.transition_editorial_post[\s\S]+manage_all'\) or v_post\.author_user_id=auth\.uid\(\)/);
  assert.match(migration, /function public\.restore_editorial_revision[\s\S]+edit_own'[\s\S]+v_post\.author_user_id=auth\.uid\(\)/);
});

test('delete stays behind the authenticated workflow boundary', () => {
  assert.match(migration, /revoke all on function public\.delete_editorial_post\(uuid\) from public,anon,service_role/);
  assert.match(migration, /grant execute on function public\.delete_editorial_post\(uuid\) to authenticated/);
  assert.match(migration, /p_action not in\([\s\S]+'delete'/);
  assert.match(api, /delete: 'delete'/);
});
