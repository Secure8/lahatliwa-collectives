import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('project deletion is server-authorized for Super Admin and owner-only Creatives', () => {
  const migration = read('supabase/migrations/20260815060000_super_admin_project_deletion.sql');
  assert.match(migration, /account\.role = 'super_admin'/);
  assert.match(migration, /account\.role = 'creative'[\s\S]*project\.owner_user_id = check_user_id or project\.created_by = check_user_id/);
  assert.match(migration, /create or replace function public\.delete_project_with_cleanup/);
  assert.match(migration, /revoke delete on public\.projects from authenticated/);
  assert.match(migration, /grant execute on function public\.delete_project_with_cleanup\(uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /creative_member_id[\s\S]*is_primary=true/);
});

test('project deletion queues R2 and legacy media before preserving an audit event', () => {
  const migration = read('supabase/migrations/20260815060000_super_admin_project_deletion.sql');
  const audit = migration.indexOf('insert into public.storage_audit_events');
  const deletion = migration.indexOf('delete from public.projects');
  assert.match(migration, /provider in \('cloudflare_r2','supabase'\)/);
  assert.match(migration, /legacy_project_media_path/);
  assert.match(migration, /super_admin_project_deleted/);
  assert.ok(audit > 0 && deletion > audit);
});

test('the one-time reset targets projects only through the audited cleanup helper', () => {
  const reset = read('supabase/migrations/20260815070000_reset_all_projects_for_ux.sql');
  assert.match(reset, /for project_row in select id from public\.projects/);
  assert.match(reset, /private\.delete_project_with_media/);
  assert.match(reset, /Production UX\/UI project reset/);
  assert.match(reset, /file_category in \('project_gallery','project_cover','external_thumbnail'\)/);
  assert.match(reset, /bucket_id = 'project-media' and name like 'projects\/%'/);
  assert.doesNotMatch(reset, /delete from public\.(admin_users|creative_members|site_settings|page_content|services)/);
  assert.doesNotMatch(reset, /truncate/i);
});

test('the browser uses the single cleanup RPC instead of direct project deletion', () => {
  const deletion = read('src/lib/deleteOwnedProject.js');
  const admin = read('src/pages/admin/AdminProjects.jsx');
  assert.match(deletion, /rpc\('delete_project_with_cleanup'/);
  assert.doesNotMatch(deletion, /from\('projects'\)\.delete/);
  assert.match(admin, /Super Admin project moderation deletion/);
});
