import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('operational storage views become RLS-backed security invokers', async () => {
  const sql = await source('supabase/security_advisor_hardening.sql');
  assert.match(sql, /alter view public\.storage_connection_operations[\s\S]*security_invoker = true/);
  assert.match(sql, /alter view public\.storage_migration_operations[\s\S]*security_invoker = true/);
  assert.match(sql, /create policy "Super Admins can read storage connection operations"[\s\S]*private\.has_role\(auth\.uid\(\), array\['super_admin'\]\)/);
  assert.match(sql, /create policy "Super Admins can read storage migration operations"[\s\S]*private\.has_role\(auth\.uid\(\), array\['super_admin'\]\)/);
  assert.match(sql, /revoke all on table public\.storage_connection_operations[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(sql, /grant select on table public\.storage_connection_operations to authenticated/);
});

test('invoker prerequisites expose only safe storage columns', async () => {
  const sql = await source('supabase/security_advisor_hardening.sql');
  const connectionGrant = sql.match(/grant select \(([^)]*)\) on table public\.storage_connections to authenticated/)?.[1] || '';
  const migrationGrant = sql.match(/grant select \(([^)]*)\) on table public\.storage_migrations to authenticated/)?.[1] || '';

  for (const field of ['id', 'owner_user_id', 'provider', 'provider_account_email', 'root_folder_health', 'disconnected_at']) {
    assert.match(connectionGrant, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['provider_account_id', 'root_folder_id', 'credential_secret_id', 'folder_ids', 'granted_scopes']) {
    assert.doesNotMatch(connectionGrant, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['id', 'owner_user_id', 'source_provider', 'destination_provider', 'status', 'checksum_verified']) {
    assert.match(migrationGrant, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['media_object_id', 'destination_connection_id', 'source_bucket', 'source_path', 'destination_file_id', 'verification_details']) {
    assert.doesNotMatch(migrationGrant, new RegExp(`\\b${field}\\b`));
  }
});

test('public and authenticated inquiry RPC grants match actual application callers', async () => {
  const [sql, startProject, adminInquiries] = await Promise.all([
    source('supabase/security_advisor_hardening.sql'),
    source('src/pages/StartProject.jsx'),
    source('src/pages/admin/AdminInquiries.jsx'),
  ]);

  assert.match(startProject, /supabase\.rpc\('list_eligible_inquiry_creatives'\)/);
  assert.match(sql, /grant execute on function public\.list_eligible_inquiry_creatives\(\)\s+to anon, authenticated/);
  assert.match(adminInquiries, /supabase\.rpc\('list_inquiry_team_members'\)/);
  assert.equal((adminInquiries.match(/supabase\.rpc\('perform_team_inquiry_action'/g) || []).length, 2);
  assert.match(sql, /grant execute on function public\.list_inquiry_team_members\(\)\s+to authenticated/);
  assert.match(sql, /grant execute on function public\.perform_team_inquiry_action\(uuid, text, jsonb\)\s+to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.(?:list_inquiry_team_members|perform_team_inquiry_action)[\s\S]{0,100}\bto anon\b/);
});

test('SECURITY DEFINER functions keep explicit authorization and safe resolution', async () => {
  const [hardening, portal, workspace] = await Promise.all([
    source('supabase/security_advisor_hardening.sql'),
    source('supabase/service_request_portal.sql'),
    source('supabase/team_inquiry_workspace.sql'),
  ]);

  for (const signature of [
    'private.user_role\\(uuid\\)',
    'private.has_role\\(uuid, text\\[\\]\\)',
    'private.is_active_inquiry_team_member\\(uuid\\)',
    'public.list_eligible_inquiry_creatives\\(\\)',
    'public.list_inquiry_team_members\\(\\)',
    'public.perform_team_inquiry_action\\(uuid, text, jsonb\\)',
  ]) assert.match(hardening, new RegExp(`alter function ${signature} set search_path = ''`));

  assert.match(portal, /cm\.is_published = true[\s\S]*au\.status = 'active'[\s\S]*au\.user_id is not null/);
  assert.match(workspace, /where private\.is_active_inquiry_team_member\(auth\.uid\(\)\)/);
  assert.match(workspace, /where user_id = auth\.uid\(\) and status = 'active'/);
  assert.match(workspace, /actor\.role not in \('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'\)/);
  assert.match(workspace, /p_action = 'admin_assign' and not is_super_admin/);
  assert.match(workspace, /inquiry\.current_assignee_id is distinct from actor\.id/);
  assert.doesNotMatch(workspace.slice(workspace.indexOf('create or replace function public.perform_team_inquiry_action'), workspace.indexOf('create or replace function public.execute_super_admin_inquiry_delete')), /\bexecute\s+(?:format|p_action|p_payload)/i);
});

test('public, authenticated, owner, Team-member, and admin access remain distinct', async () => {
  const [hardening, portal, workspace, rbac] = await Promise.all([
    source('supabase/security_advisor_hardening.sql'),
    source('supabase/service_request_portal.sql'),
    source('supabase/team_inquiry_workspace.sql'),
    source('supabase/team_rbac_upgrade.sql'),
  ]);

  assert.match(hardening, /list_eligible_inquiry_creatives\(\)\s+to anon, authenticated/);
  assert.match(portal, /returns table \(id uuid, name text, slug text, role text, profile_image_url text\)/);
  assert.match(workspace, /where private\.is_active_inquiry_team_member\(auth\.uid\(\)\)/);
  assert.match(workspace, /member\.role in \('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'\)/);
  assert.match(workspace, /actor\.role not in \('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'\)/);
  assert.match(workspace, /is_super_admin := actor\.role in \('super_admin', 'owner'\)/);
  assert.match(rbac, /when role = 'owner' then 'super_admin'/);
  assert.match(hardening, /private\.has_role\(auth\.uid\(\), array\['super_admin'\]\)/);
});

test('role matrix and Phase 4 isolation are encoded without touching pg_net', async () => {
  const [sql, flags, phase4, cron] = await Promise.all([
    source('supabase/security_advisor_hardening.sql'),
    source('.env.example'),
    source('docs/google-drive-byos-phase4-project-gallery.md'),
    source('supabase/storage_cleanup_worker_cron.sql'),
  ]);

  assert.match(sql, /has_function_privilege\('anon', 'public\.list_eligible_inquiry_creatives\(\)', 'execute'\)/);
  assert.match(sql, /has_function_privilege\('authenticated', 'public\.list_inquiry_team_members\(\)', 'execute'\)/);
  assert.match(sql, /has_function_privilege\('authenticated', 'public\.perform_team_inquiry_action\(uuid,text,jsonb\)', 'execute'\)/);
  assert.match(sql, /private\.has_role\(auth\.uid\(\), array\['super_admin'\]\)/);
  assert.match(flags, /VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=false/);
  assert.match(phase4, /No new SQL is required/);
  assert.match(cron, /net\.http_post/);
  assert.doesNotMatch(sql, /(?:create|alter|drop)\s+extension\s+(?:if\s+(?:not\s+)?exists\s+)?pg_net/i);
  assert.doesNotMatch(sql, /external_media_objects|google-drive-media-lifecycle|VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED/);
});
