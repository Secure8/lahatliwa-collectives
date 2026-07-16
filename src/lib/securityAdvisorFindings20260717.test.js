import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const migrationPath = 'supabase/migrations/20260717100000_security_advisor_findings_hardening.sql';

test('storage totals are invoker views with no direct ordinary-role grants', async () => {
  const [sql, edge] = await Promise.all([
    source(migrationPath),
    source('supabase/functions/storage-governance/index.ts'),
  ]);
  for (const view of ['storage_usage_by_owner', 'storage_usage_by_project', 'storage_usage_by_creative']) {
    assert.match(sql, new RegExp(`alter view public\\.${view} set \\(security_invoker = true, security_barrier = true\\)`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${view} from public, anon, authenticated, service_role`));
  }
  assert.match(sql, /RLS must be enabled on public\.external_media_objects/);
  assert.match(edge, /get_storage_governance_snapshot/);
  assert.match(edge, /actor\.role\s*!==\s*'super_admin'/);
});

test('own-usage function derives identity only from auth.uid and is backend-only', async () => {
  const sql = await source(migrationPath);
  const definition = sql.slice(sql.indexOf('create or replace function public.get_my_public_media_usage'), sql.indexOf('-- No application caller'));
  assert.match(definition, /get_my_public_media_usage\(\)/);
  assert.doesNotMatch(definition, /p_(?:owner|user|actor)/i);
  assert.match(definition, /where media\.owner_user_id = auth\.uid\(\)/);
  assert.match(definition, /security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(sql, /revoke all on function public\.get_my_public_media_usage\(\) from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.get_my_public_media_usage\(\) to service_role/);
});

test('public creative endpoint exposes only published eligible display fields', async () => {
  const [edge, ui, config] = await Promise.all([
    source('supabase/functions/inquiry-public-options/index.ts'),
    source('src/pages/StartProject.jsx'),
    source('supabase/config.toml'),
  ]);
  assert.match(edge, /select\('id, name, slug, role, profile_image_url'\)/);
  assert.match(edge, /eq\('is_published', true\)/);
  assert.match(edge, /eq\('status', 'active'\)/);
  assert.match(edge, /not\('user_id', 'is', null\)/);
  assert.doesNotMatch(edge, /provider_account|credential|notification_email|\.select\([^)]*email/);
  assert.match(ui, /functions\.invoke\('inquiry-public-options'/);
  assert.match(config, /\[functions\.inquiry-public-options\]\s+verify_jwt = false/);
});

test('internal inquiry functions have fixed paths and no browser execution grants', async () => {
  const sql = await source(migrationPath);
  for (const signature of [
    'list_eligible_inquiry_creatives\\(\\)',
    'list_inquiry_team_members\\(\\)',
    'perform_team_inquiry_action\\(uuid, text, jsonb\\)',
  ]) {
    assert.match(sql, new RegExp(`alter function public\\.${signature} set search_path = pg_catalog`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated, service_role`));
  }
  assert.match(sql, /perform_team_inquiry_action_as_service[\s\S]*security definer[\s\S]*set search_path = pg_catalog/);
  assert.match(sql, /if auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /grant execute on function public\.perform_team_inquiry_action_as_service\(uuid, uuid, text, jsonb\) to service_role/);
});

test('team endpoint authenticates an active role before listing or mutating', async () => {
  const [edge, ui, databaseAuthorization] = await Promise.all([
    source('supabase/functions/inquiry-workflow/index.ts'),
    source('src/pages/admin/AdminInquiries.jsx'),
    source('supabase/team_inquiry_workspace.sql'),
  ]);
  const authCheck = edge.indexOf('auth.getUser()');
  const membershipCheck = edge.indexOf("eq('user_id', user.id).eq('status', 'active')");
  const listAction = edge.indexOf("action === 'list_team_members'");
  const mutationAction = edge.indexOf("action === 'team_action'");
  assert.ok(authCheck >= 0 && membershipCheck > authCheck && listAction > membershipCheck && mutationAction > listAction);
  assert.match(edge, /select\('id, display_name, role, creative_member_id, avatar_url'\)/);
  assert.doesNotMatch(edge, /select\('id, display_name, role, creative_member_id, avatar_url, (?:email|user_id|notification)/);
  assert.match(ui, /list_team_members/);
  assert.doesNotMatch(ui, /supabase\.rpc\('(?:list_inquiry_team_members|perform_team_inquiry_action)'/);
  assert.match(databaseAuthorization, /where user_id = auth\.uid\(\) and status = 'active'/);
  assert.match(databaseAuthorization, /Only the current assignee may transfer/);
  assert.match(databaseAuthorization, /Only the Super Admin may archive/);
});

test('pg_net remains unchanged and no destructive extension operation is introduced', async () => {
  const [sql, cron, bootstrap] = await Promise.all([
    source(migrationPath),
    source('supabase/storage_cleanup_worker_cron.sql'),
    source('supabase/storage_cleanup_cron_bootstrap.sql'),
  ]);
  assert.doesNotMatch(sql, /\b(?:create|alter|drop)\s+extension\b/i);
  assert.doesNotMatch(sql, /\bcascade\b/i);
  assert.match(cron, /net\.http_post/);
  assert.match(bootstrap, /net\.http_post/);
});
