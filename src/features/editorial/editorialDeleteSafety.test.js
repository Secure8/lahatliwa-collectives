import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { editorialActionError } from './editorialApi.js';

const root = new URL('../../../', import.meta.url);
const sql = readFileSync(new URL('supabase/migrations/20260722160000_editorial_delete_and_imageless_slides.sql', root), 'utf8');
const studio = readFileSync(new URL('src/pages/editorial/EditorialStudio.jsx', root), 'utf8');

test('permanent deletion keeps owner scope and Super Admin cross-account authority', () => {
  assert.match(sql, /has_editorial_capability\(auth\.uid\(\),'delete_any'\)/);
  assert.match(sql, /has_editorial_capability\(auth\.uid\(\),'delete_own'\)[\s\S]*v_post\.author_user_id=auth\.uid\(\)/);
  assert.match(sql, /EDITORIAL_NOT_AUTHORIZED/);
  assert.match(sql, /errcode='42501'/);
});

test('story must be archived and revision pointers are cleared before delete', () => {
  assert.match(sql, /v_post\.status <> 'archived'[\s\S]*EDITORIAL_ARCHIVE_REQUIRED/);
  assert.match(sql, /set current_revision_id=null,published_revision_id=null,scheduled_revision_id=null[\s\S]*delete from public\.editorial_posts/);
  assert.match(studio, /capabilities\.canDeleteOwn && post\.status === 'archived'/);
  assert.match(studio, /Delete permanently/);
});

test('deletion clears homepage selection, queues media cleanup, and preserves a safe marker', () => {
  assert.match(sql, /update public\.editorial_homepage_slides set post_id=null,enabled=false/);
  assert.match(sql, /insert into public\.storage_cleanup_jobs/);
  assert.match(sql, /null::uuid,'Editorial story deleted'/);
  assert.match(sql, /accounting_state='pending_cleanup'/);
  assert.match(sql, /insert into public\.editorial_audit_events[\s\S]*values\(auth\.uid\(\),null,'delete'/);
  assert.match(sql, /'deletedPostId',v_post\.id/);
});

test('delete RPC is available only to authenticated callers', () => {
  assert.match(sql, /revoke all on function public\.delete_editorial_post\(uuid\) from public,anon,service_role/);
  assert.match(sql, /grant execute on function public\.delete_editorial_post\(uuid\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.delete_editorial_post\(uuid\) to (anon|public)/i);
});

test('frontend returns useful and safe deletion messages', () => {
  assert.equal(editorialActionError({ message: 'EDITORIAL_ARCHIVE_REQUIRED' }).message, 'Archive this story before deleting it permanently.');
  assert.equal(editorialActionError({ message: 'EDITORIAL_RELATED_RECORDS' }).message, 'This story could not be deleted because related records still exist.');
  assert.equal(editorialActionError({ code: '42501', message: 'EDITORIAL_NOT_AUTHORIZED' }, 'delete this story').message, 'You do not have permission to delete this story.');
});
