import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertEditorialDraftId, editorialActionError, editorialDraftError } from './editorialApi.js';
import { normalizeSupabaseEnvironment } from '../../lib/supabaseClient.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('quoted and blank Vercel values normalize before configuration checks', () => {
  assert.equal(normalizeSupabaseEnvironment('  "https://example.supabase.co"  '), 'https://example.supabase.co');
  assert.equal(normalizeSupabaseEnvironment("'publishable-key'"), 'publishable-key');
  assert.equal(normalizeSupabaseEnvironment('""'), '');
});

test('draft IDs must be UUIDs before a Supabase query can run', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(assertEditorialDraftId(id), id);
  for (const invalid of [undefined, '', 'undefined', 'not-a-uuid']) {
    assert.throws(() => assertEditorialDraftId(invalid), (error) => error.code === 'EDITORIAL_DRAFT_ID_INVALID');
  }
});

test('draft errors distinguish access, network, schema, and configuration failures', () => {
  assert.equal(editorialDraftError({ code: '42501', message: 'row-level security' }).code, 'EDITORIAL_ACCESS_DENIED');
  assert.equal(editorialDraftError(new TypeError('Failed to fetch')).code, 'EDITORIAL_NETWORK_ERROR');
  assert.equal(editorialDraftError({ code: 'PGRST205', message: 'relation is missing from schema cache' }).code, 'EDITORIAL_DATABASE_UNAVAILABLE');

  const configurationError = Object.assign(new Error('missing configuration'), { code: 'SUPABASE_CONFIGURATION_MISSING' });
  assert.equal(editorialDraftError(configurationError), configurationError);
});

test('workflow authorization codes produce a clear permission message', () => {
  const error = editorialActionError({ code: 'EDITORIAL_NOT_AUTHORIZED', message: 'Your Editorial role does not allow this action.' }, 'create the draft');
  assert.equal(error.code, 'EDITORIAL_ACCESS_DENIED');
  assert.match(error.message, /permission/i);
});

test('cover upload failures distinguish authorization, availability, validation, and storage errors', () => {
  assert.equal(editorialActionError({ code: 'TARGET_NOT_AUTHORIZED' }, 'upload the cover').code, 'EDITORIAL_ACCESS_DENIED');
  assert.equal(editorialActionError({ code: 'R2_MEDIA_DISABLED' }, 'upload the cover').code, 'EDITORIAL_MEDIA_UNAVAILABLE');
  assert.equal(editorialActionError({ code: 'DERIVATIVE_INVALID' }, 'upload the cover').code, 'EDITORIAL_MEDIA_INVALID');
  assert.equal(editorialActionError({ code: 'R2_UPLOAD_FAILED' }, 'upload the cover').code, 'EDITORIAL_MEDIA_UPLOAD_FAILED');
});

test('draft creation recovers an earlier row with no initial revision and cleans up new partial rows', () => {
  const api = source('src/features/editorial/editorialApi.js');
  const createSource = api.slice(api.indexOf('export async function createEditorialDraft'), api.indexOf('export async function saveEditorialDetails'));
  assert.match(createSource, /\.is\('current_revision_id', null\)/);
  assert.match(createSource, /let data = recoverable/);
  assert.match(createSource, /if \(inserted\) await supabase\.rpc\('delete_editorial_post'/);
});

test('owner deletion uses the protected direct RPC instead of the service workflow bridge', () => {
  const api = source('src/features/editorial/editorialApi.js');
  const workflow = api.slice(api.indexOf('export async function runEditorialWorkflow'), api.indexOf('export async function restoreEditorialRevision'));
  assert.match(workflow, /action === 'delete'/);
  assert.match(workflow, /supabase\.rpc\('delete_editorial_post', \{ p_post_id: postId \}\)/);
});

test('getEditorialDraft returns not-found only after a successful authenticated row query', () => {
  const api = source('src/features/editorial/editorialApi.js');
  const getDraftSource = api.slice(api.indexOf('export async function getEditorialDraft'), api.indexOf('export async function saveEditorialAutosave'));
  assert.match(getDraftSource, /supabase\.auth\.getSession\(\)/);
  assert.match(getDraftSource, /const draftId = assertEditorialDraftId\(id\)/);
  assert.match(getDraftSource, /if \(error\) throw editorialDraftError\(error\);\s*if \(!post\) return null;/);
  assert.match(getDraftSource, /if \(revisionResult\.error\) throw editorialDraftError/);
  assert.match(getDraftSource, /if \(autosaveResult\.error\) throw editorialDraftError/);
  assert.doesNotMatch(getDraftSource, /if \(error \|\| !post\) return null/);
});

test('editor waits for an authenticated session and surfaces the real load error', () => {
  const studio = source('src/pages/editorial/EditorialStudio.jsx');
  assert.match(studio, /const contentMatch = path\.match/);
  assert.match(studio, /<StoryEditor id=\{contentId\} \/>/);
  assert.match(studio, /<StoryPreview id=\{contentId\} \/>/);
  assert.doesNotMatch(studio, /useParams/);
  assert.match(studio, /const authReady = Boolean\(user\?\.id && session\?\.user\?\.id\)/);
  assert.match(studio, /if \(!authReady\)/);
  assert.match(studio, /error: error\?\.message \|\| 'Draft could not be loaded\.'/);
  assert.match(studio, /error: post \? '' : 'Draft not found\.'/);
  assert.match(studio, /\[authReady, id\]/);
});
