import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../../supabase/migrations/20260815040000_security_advisor_final_hardening.sql', import.meta.url), 'utf8');

test('non-relocatable pg_net is not altered by an application migration', () => {
  assert.match(sql, /pg_net 0\.20\.3 is non-relocatable/);
  assert.doesNotMatch(sql, /(alter extension|drop extension) pg_net/);
});

test('required public RPCs become invoker wrappers around non-exposed implementations', () => {
  assert.match(sql, /create schema if not exists api_internal/);
  for (const name of ['get_public_website_studio', 'submit_creative_join_request', 'create_creative_post', 'save_creative_post', 'publish_creative_post', 'moderate_public_project', 'save_website_studio_draft']) {
    assert.match(sql, new RegExp(`alter function public\\.${name}`));
    assert.match(sql, new RegExp(`create function public\\.${name}[\\s\\S]+?security invoker`));
  }
});

test('retired editorial RPCs are no longer executable by signed-in clients', () => {
  assert.match(sql, /revoke execute on function public\.approve_editorial_post[\s\S]+from public, anon, authenticated/);
});
