import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('all requested public, studio, and admin routes are lazy and additive', () => {
  const app = source('src/App.jsx');
  for (const route of ['/explore', '/journal', '/events', '/places', '/activities', '/local-products', '/editorial/*', '/admin/editorial/*']) {
    assert.match(app, new RegExp(route.replace(/[/*]/g, (value) => `\\${value}`)));
  }
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/tourism\/TourismIndex'\)\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/editorial\/EditorialStudio'\)\)/);
});

test('migration defaults every release flag off and validates structured documents', () => {
  const sql = source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql');
  assert.match(sql, /module_enabled boolean not null default false/);
  assert.match(sql, /public_portal_enabled boolean not null default false/);
  assert.match(sql, /homepage_tourism_enabled boolean not null default false/);
  assert.match(sql, /editorial_studio_enabled boolean not null default false/);
  assert.match(sql, /editorial_media_uploads_enabled boolean not null default false/);
  assert.match(sql, /private\.valid_editorial_document/);
  assert.match(sql, /html\|rawHtml\|css\|javascript\|script/);
  assert.match(sql, /EDITORIAL_WORKFLOW_FIELDS_REQUIRE_RPC/);
  assert.match(sql, /EDITORIAL_REVISION_CONFLICT/);
  assert.match(sql, /editorial_autosaves/);
  assert.match(sql, /editorial_sources/);
  assert.match(sql, /status in \('draft','submitted','needs_revision','approved','scheduled','published','expired','archived'\)/);
});

test('published revisions and metadata stay stable while a new draft is edited', () => {
  const sql = source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql');
  const api = source('src/features/editorial/editorialApi.js');
  assert.match(sql, /published_metadata/);
  assert.match(sql, /p_action='start_revision'/);
  assert.match(sql, /published_revision_id is not null and published_at is not null and archived_at is null/);
  assert.match(api, /withPublishedSnapshot/);
  assert.match(api, /p_expected_current_revision_id/);
  assert.match(api, /p_metadata/);
  assert.doesNotMatch(api, /from\('editorial_posts'\)\.update/);
});

test('tourism homepage is separately flagged and lazy-loaded', () => {
  const home = source('src/pages/Home.jsx');
  const sections = source('src/pages/tourism/TourismHomepageSections.jsx');
  assert.match(home, /lazy\(\(\) => import\('\.\/tourism\/TourismHomepageSections\.jsx'\)\)/);
  assert.match(sections, /homepageTourismEnabled/);
  assert.match(sections, /listTourismHomepageSections/);
});

test('writer permissions remain separate from review and publishing', () => {
  const sql = source('supabase/migrations/20260719090000_editorial_tourism_foundation.sql');
  assert.match(sql, /\('super_admin','admin','editor','writer'\)/);
  assert.match(sql, /\('super_admin','admin','editor'\)/);
  assert.doesNotMatch(sql, /p_capability in \('review'[^\n]+writer/);
});

test('editorial R2 deletion fails closed through both immediate and cleanup scans', () => {
  const edge = source('supabase/functions/r2-media/index.ts');
  const worker = source('supabase/functions/process-storage-cleanup/index.ts');
  for (const text of [edge, worker]) {
    assert.match(text, /editorial_revisions/);
    assert.match(text, /editorial_autosaves/);
    assert.match(text, /REFERENCE_CHECK_FAILED/);
  }
  assert.match(worker, /editorial_post_id/);
});

test('contextual inquiries verify a published record before storing canonical metadata', () => {
  const edge = source('supabase/functions/submit-service-request/index.ts');
  assert.match(edge, /public_inquiries_enabled/);
  assert.match(edge, /\.eq\('status', 'published'\)/);
  assert.match(edge, /editorial_content_id/);
  assert.doesNotMatch(edge, /request_metadata:\s*normalized\.editorialContext/);
});

test('shared renderer is used by public and preview modes', () => {
  const publicPage = source('src/pages/tourism/TourismDetail.jsx');
  const studio = source('src/pages/editorial/EditorialStudio.jsx');
  assert.match(publicPage, /EditorialDocumentRenderer/);
  assert.match(studio, /EditorialDocumentRenderer/);
  assert.match(studio, /mode="preview"/);
});

test('studio exposes source verification and type-specific tourism data tools', () => {
  const studio = source('src/pages/editorial/EditorialStudio.jsx');
  assert.match(studio, /\/editorial\/sources/);
  assert.match(studio, /\/editorial\/details/);
  assert.match(studio, /\/editorial\/history/);
  assert.match(studio, /restore_editorial_revision/);
  assert.match(studio, /editorial_event_details/);
  assert.match(studio, /verification_status/);
});
