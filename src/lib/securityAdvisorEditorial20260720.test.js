import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migration = source('supabase/migrations/20260720110000_editorial_rpc_advisor_hardening.sql');
const edge = source('supabase/functions/editorial-workflow/index.ts');
const api = source('src/features/editorial/editorialApi.js');

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

test('advisor hardening initially removes direct browser execution from every Editorial SECURITY DEFINER RPC', () => {
  for (const signature of signatures) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public,anon,authenticated,service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.match(migration, /has_function_privilege\('anon',hardened_function,'EXECUTE'\)/);
  assert.match(migration, /has_function_privilege\('authenticated',hardened_function,'EXECUTE'\)/);
});

test('service bridge is service-only, action-allowlisted, and restores verified actor identity', () => {
  assert.match(migration, /if auth\.role\(\)<>'service_role'/);
  assert.match(migration, /p_action not in\([\s\S]+'save_revision'[\s\S]+'restore_archived'/);
  assert.doesNotMatch(migration, /\bexecute\s+(?:format|p_action|p_payload)/i);
  assert.match(migration, /set_config\('request\.jwt\.claim\.sub',p_actor_user_id::text,true\)/);
  assert.match(migration, /revoke all on function public\.execute_editorial_action_as_service\(uuid,text,jsonb\) from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function public\.execute_editorial_action_as_service\(uuid,text,jsonb\) to service_role/);
});

test('Edge endpoint authenticates an active Editorial role before using the service bridge', () => {
  const auth = edge.indexOf('callerClient.auth.getUser()');
  const membership = edge.indexOf("eq('user_id', user.id).eq('status', 'active')");
  const bridge = edge.indexOf("admin.rpc('execute_editorial_action_as_service'");
  assert.ok(auth >= 0 && membership > auth && bridge > membership);
  assert.match(edge, /select\('role,status,editorial_roles'\)/);
  assert.match(edge, /canUseEditorialWorkflow\(caller\)/);
  assert.match(edge, /safeEditorialWorkflowRequest/);
  assert.doesNotMatch(edge, /console\.(?:log|error)\([^\n]*(?:authorization|serviceKey|token)/i);
});

test('Editorial browser API uses the Edge endpoint instead of direct definer RPCs', () => {
  assert.match(api, /supabase\.functions\.invoke\('editorial-workflow'/);
  for (const name of ['save_editorial_revision', 'submit_editorial_post', 'publish_editorial_post', 'archive_editorial_post', 'restore_editorial_revision']) {
    assert.doesNotMatch(api, new RegExp(`supabase\\.rpc\\('${name}'`));
  }
});

test('lifecycle snapshots get an explicit restrictive deny policy without broader access', () => {
  assert.match(migration, /create policy admin_member_lifecycle_snapshots_deny_clients[\s\S]+as restrictive[\s\S]+to anon,authenticated[\s\S]+using\(false\)[\s\S]+with check\(false\)/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all) on (?:table )?public\.admin_member_lifecycle_snapshots to (?:anon|authenticated)/i);
});

test('advisor hardening does not drop or reinstall the active pg_net extension', () => {
  assert.doesNotMatch(migration, /(?:drop|create|alter)\s+extension\s+pg_net/i);
  assert.doesNotMatch(migration, /\bcascade\b/i);
});
