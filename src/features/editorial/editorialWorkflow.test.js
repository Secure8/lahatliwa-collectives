import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editorialDirectPublishSteps } from './editorialApi.js';
import { editorialCapabilities } from './editorialCapabilities.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const migration = source('supabase/migrations/20260720170000_editorial_owner_workspace_autonomy.sql');
const foundation = source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql');
const studio = source('src/pages/editorial/EditorialStudio.jsx');
const api = source('src/features/editorial/editorialApi.js');

test('restore and delete follow ownership while settings remain administrative', () => {
  assert.equal(editorialCapabilities('super_admin').canManageSettings, true);
  assert.equal(editorialCapabilities('owner').canManageSettings, true);
  assert.equal(editorialCapabilities('admin').canManageSettings, true);
  assert.equal(editorialCapabilities('editor').canManageSettings, false);
  assert.equal(editorialCapabilities('writer').canManageSettings, false);
  assert.equal(editorialCapabilities('writer').canRestoreOwn, true);
  assert.equal(editorialCapabilities('writer').canDeleteOwn, true);
  assert.equal(editorialCapabilities('writer').canDeleteAny, false);
  assert.equal(editorialCapabilities('super_admin').canDeleteAny, true);
  assert.match(migration, /v_post\.author_user_id=auth\.uid\(\)/);
  assert.match(migration, /p_capability in \('manage_all','view_audit','delete_any'\)[\s\S]+v_role='super_admin'/);
});

test('unauthorized cross-account actions are rejected', () => {
  assert.match(migration, /raise exception 'EDITORIAL_NOT_AUTHORIZED'/);
  assert.match(migration, /manage_all'\) or \(private\.has_editorial_capability\(auth\.uid\(\),'restore_own'\) and v_post\.author_user_id=auth\.uid\(\)\)/);
  assert.match(migration, /manage_all'\) or v_post\.author_user_id=auth\.uid\(\)/);
});

test('archived restoration updates the same post in place and preserves its relationships and history', () => {
  const restoreFunction = migration.match(/create or replace function public\.restore_archived_editorial_post[\s\S]+?\n\$\$;/)?.[0] || '';
  assert.match(migration, /v_post\.status<>'archived'/);
  assert.match(migration, /update public\.editorial_posts set status='draft',archived_at=null,updated_at=now\(\) where id=p_post_id/s);
  assert.doesNotMatch(restoreFunction, /insert into public\.editorial_posts/);
  assert.doesNotMatch(restoreFunction, /delete from/);
  assert.doesNotMatch(restoreFunction, /set[\s\S]{0,120}(current_revision_id|published_revision_id|published_metadata|published_at|author_user_id|assigned_editor_user_id)\s*=/);
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

test('owners publish directly while advanced workflow RPCs remain ownership-scoped', () => {
  assert.deepEqual(editorialDirectPublishSteps('draft'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('changes_requested'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('in_review'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('approved'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('scheduled'), ['publish']);
  assert.deepEqual(editorialDirectPublishSteps('archived'), []);
  assert.match(api, /restore: 'restore_archived'/);
  assert.match(api, /delete: 'delete'/);
  assert.match(api, /functions\.invoke\('editorial-workflow'/);
  assert.match(studio, /for \(const action of steps\) next = await runEditorialWorkflow\(id, action\)/);
  assert.doesNotMatch(studio, /Submitted for review/);
});

test('Editorial Studio exposes clear save, preview, publish, archive, restore, and delete actions', () => {
  for (const label of ['Save Draft', 'Preview', 'Publish', 'Archive', 'Restore', 'Delete']) assert.match(studio, new RegExp(label));
  assert.doesNotMatch(studio, /StudioSelect label="Status"/);
  assert.match(studio, /message: 'Draft saved\.'/);
  assert.match(studio, /message: 'Published\.'/);
  assert.match(studio, /workflow\('archive', \{\}, 'Archived\.'\)/);
  assert.match(studio, /'Restored to draft\. You can edit it now\.'/);
  assert.match(studio, /navigate\(`\/editorial\/content\/\$\{id\}\/edit`, \{ replace: true \}\)/);
  assert.match(studio, /navigate\(`\/editorial\/content\/\$\{id\}\/preview`\)/);
  assert.match(studio, /const draftEditable =/);
  assert.match(studio, /requestConfirmation\(\{/);
});
