import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editorialDirectPublishSteps } from './editorialApi.js';
import { editorialCapabilities } from './editorialCapabilities.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const migration = source('supabase/migrations/20260720090000_restore_archived_editorial_post.sql');
const foundation = source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql');
const studio = source('src/pages/editorial/EditorialStudio.jsx');
const api = source('src/features/editorial/editorialApi.js');

test('restore authorization is limited to Admin and Super Admin capabilities', () => {
  assert.equal(editorialCapabilities('super_admin').canManageSettings, true);
  assert.equal(editorialCapabilities('owner').canManageSettings, true);
  assert.equal(editorialCapabilities('admin').canManageSettings, true);
  assert.equal(editorialCapabilities('editor').canManageSettings, false);
  assert.equal(editorialCapabilities('writer').canManageSettings, false);
  assert.match(foundation, /manage_taxonomy','manage_contributors','manage_settings','view_audit'[\s\S]+v_role in \('super_admin','admin'\)/);
  assert.match(migration, /private\.has_editorial_capability\(auth\.uid\(\),'manage_settings'\)/);
});

test('unauthorized restore calls are rejected before the post is read or changed', () => {
  const authorization = migration.indexOf("if not private.has_editorial_capability(auth.uid(),'manage_settings')");
  const postRead = migration.indexOf('select * into v_post');
  assert.ok(authorization >= 0 && authorization < postRead);
  assert.match(migration, /raise exception 'EDITORIAL_NOT_AUTHORIZED'/);
  assert.match(migration, /revoke all on function public\.restore_archived_editorial_post\(uuid\) from public,anon,service_role/);
  assert.match(migration, /grant execute on function public\.restore_archived_editorial_post\(uuid\) to authenticated/);
});

test('archived restoration updates the same post in place and preserves its relationships and history', () => {
  assert.match(migration, /v_post\.status<>'archived'/);
  assert.match(migration, /update public\.editorial_posts\s+set status='draft',updated_at=now\(\)\s+where id=p_post_id/s);
  assert.doesNotMatch(migration, /insert into public\.editorial_posts/);
  assert.doesNotMatch(migration, /delete from/);
  assert.doesNotMatch(migration, /set[\s\S]{0,120}(current_revision_id|published_revision_id|published_metadata|published_at|archived_at|author_user_id|assigned_editor_user_id)\s*=/);
  assert.match(migration, /set_config\('app\.editorial_workflow','1',true\)/);
  assert.match(foundation, /EDITORIAL_WORKFLOW_FIELDS_REQUIRE_RPC/);
  assert.match(foundation, /editorial_posts_team_update[\s\S]+status in\('draft','needs_revision'\)/);
});

test('restore action is appended to editorial audit history', () => {
  assert.match(migration, /insert into public\.editorial_audit_events/);
  assert.match(migration, /'restore_to_draft'[\s\S]+'archived'[\s\S]+'draft'/);
  assert.match(migration, /'currentRevisionId',v_post\.current_revision_id/);
  assert.match(migration, /'publishedRevisionId',v_post\.published_revision_id/);
});

test('Super Admin direct publish keeps the advanced RPC workflow intact', () => {
  assert.deepEqual(editorialDirectPublishSteps('draft'), ['submit', 'approve', 'publish']);
  assert.deepEqual(editorialDirectPublishSteps('changes_requested'), ['submit', 'approve', 'publish']);
  assert.deepEqual(editorialDirectPublishSteps('in_review'), ['approve', 'publish']);
  assert.deepEqual(editorialDirectPublishSteps('approved'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('scheduled'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('archived'), []);
  assert.match(api, /restore: 'restore_archived_editorial_post'/);
  assert.match(studio, /for \(const action of steps\)[\s\S]+post = await runEditorialWorkflow\(id, action\)/);
  assert.match(studio, /!isSuperAdmin && \['draft', 'changes_requested'\]/);
});

test('Editorial Studio exposes clear save, preview, publish, archive, and restore actions', () => {
  for (const label of ['Save Draft', 'Preview', 'Publish', 'Archive', 'Restore to Draft']) assert.match(studio, new RegExp(label));
  assert.doesNotMatch(studio, /StudioSelect label="Status"/);
  assert.match(studio, /message: 'Draft saved\.'/);
  assert.match(studio, /message: 'Published\.'/);
  assert.match(studio, /workflow\('archive', \{\}, 'Archived\.'\)/);
  assert.match(studio, /message: 'Restored to draft\. You can edit it now\.'/);
  assert.match(studio, /navigate\(`\/editorial\/content\/\$\{id\}\/edit`, \{ replace: true \}\)/);
  assert.match(studio, /"\/editorial\/content\/" \+ id \+ "\/preview"/);
  assert.match(studio, /<fieldset disabled=\{!draftEditable\}/);
});
