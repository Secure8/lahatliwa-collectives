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

test('inquiry callers use narrow Edge endpoints instead of directly exposed definer RPCs', async () => {
  const [sql, startProject, adminInquiries] = await Promise.all([
    source('supabase/migrations/20260717100000_security_advisor_findings_hardening.sql'),
    source('src/pages/StartProject.jsx'),
    source('src/pages/admin/AdminInquiries.jsx'),
  ]);

  assert.match(startProject, /functions\.invoke\('inquiry-public-options'/);
  assert.doesNotMatch(startProject, /rpc\('list_eligible_inquiry_creatives'/);
  assert.match(adminInquiries, /functions\.invoke\('inquiry-workflow'/);
  assert.doesNotMatch(adminInquiries, /rpc\('(?:list_inquiry_team_members|perform_team_inquiry_action)'/);
  for (const signature of ['list_eligible_inquiry_creatives\\(\\)', 'list_inquiry_team_members\\(\\)', 'perform_team_inquiry_action\\(uuid, text, jsonb\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated, service_role`));
  }
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
  const [hardening, portal, workspace, rbac, publicEdge, teamEdge] = await Promise.all([
    source('supabase/migrations/20260717100000_security_advisor_findings_hardening.sql'),
    source('supabase/service_request_portal.sql'),
    source('supabase/team_inquiry_workspace.sql'),
    source('supabase/team_rbac_upgrade.sql'),
    source('supabase/functions/inquiry-public-options/index.ts'),
    source('supabase/functions/inquiry-workflow/index.ts'),
  ]);

  assert.match(hardening, /list_eligible_inquiry_creatives\(\) from public, anon, authenticated, service_role/);
  assert.match(portal, /returns table \(id uuid, name text, slug text, role text, profile_image_url text\)/);
  assert.match(publicEdge, /select\('id, name, slug, role, profile_image_url'\)/);
  assert.doesNotMatch(publicEdge, /select\([^)]*(?:email|user_id|availability_note)/);
  assert.match(workspace, /where private\.is_active_inquiry_team_member\(auth\.uid\(\)\)/);
  assert.match(workspace, /member\.role in \('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'\)/);
  assert.match(workspace, /actor\.role not in \('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'\)/);
  assert.match(workspace, /is_super_admin := actor\.role in \('super_admin', 'owner'\)/);
  assert.match(rbac, /when role = 'owner' then 'super_admin'/);
  assert.match(teamEdge, /auth\.getUser\(\)/);
  assert.match(teamEdge, /eq\('user_id', user\.id\)\.eq\('status', 'active'\)/);
});

test('new hardening is isolated from public-media redesign and does not touch pg_net', async () => {
  const [sql, flags, phase4, cron] = await Promise.all([
    source('supabase/migrations/20260717100000_security_advisor_findings_hardening.sql'),
    source('.env.example'),
    source('docs/google-drive-byos-phase4-project-gallery.md'),
    source('supabase/storage_cleanup_worker_cron.sql'),
  ]);

  assert.match(sql, /has_function_privilege\('anon', 'public\.list_eligible_inquiry_creatives\(\)', 'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('authenticated', 'public\.list_inquiry_team_members\(\)', 'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('authenticated', 'public\.perform_team_inquiry_action\(uuid,text,jsonb\)', 'EXECUTE'\)/);
  assert.match(flags, /VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED=false/);
  assert.match(phase4, /No new SQL is required/);
  assert.match(cron, /net\.http_post/);
  assert.doesNotMatch(sql, /(?:create|alter|drop)\s+extension\s+(?:if\s+(?:not\s+)?exists\s+)?pg_net/i);
  assert.doesNotMatch(sql, /google-drive-media-lifecycle|VITE_GOOGLE_DRIVE_PROJECT_GALLERY_ENABLED|imagemagick|cpu.limit/i);
});
