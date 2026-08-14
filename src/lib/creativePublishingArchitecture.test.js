import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('V1 migration reduces authenticated personas and enforces owned posts', () => {
  const sql = source('supabase/migrations/20260814090000_creative_social_portfolio_v1.sql');
  assert.match(sql, /check \(role in \('super_admin', 'creative'\)\)/);
  assert.match(sql, /create table public\.creative_posts/);
  assert.match(sql, /create table public\.creative_post_media/);
  assert.match(sql, /private\.valid_creative_post_document/);
  assert.match(sql, /jsonb_array_length\(block->'mediaIds'\) > 10/);
  assert.match(sql, /creative_posts_owner_update/);
  assert.match(sql, /private\.owns_creative_post\(auth\.uid\(\),id\)/);
  assert.match(sql, /private\.can_create_project[\s\S]*array\['super_admin'\]/);
  assert.match(sql, /CREATIVE_POST_IMAGE_DESCRIPTION_REQUIRED/);
});

test('application separates Creative publishing and Super Admin maintenance', () => {
  const app = source('src/App.jsx');
  const access = source('src/lib/adminAccess.jsx');
  const login = source('src/pages/admin/Login.jsx');
  assert.match(app, /path="\/create"[\s\S]*CreativeRouteGuard/);
  assert.match(app, /path="\/admin\/dashboard"[\s\S]*allow=\{\['super_admin'\]\}/);
  assert.match(app, /path="\/admin\/my-profile"[\s\S]*allow=\{\['creative'\]\}/);
  assert.deepEqual([...access.matchAll(/export const roles = \[([^\]]+)\]/g)].length, 1);
  assert.match(access, /roles = \['super_admin', 'creative'\]/);
  assert.match(login, /Navigate to="\/account"/);
});

test('Creative post media stays server-mediated in Cloudflare R2', () => {
  const shared = source('supabase/functions/_shared/r2Media.js');
  const edge = source('supabase/functions/r2-media/index.ts');
  const upload = source('supabase/functions/r2-media-upload/index.ts');
  assert.match(shared, /creative_post_image:[\s\S]*prefix: 'posts\/images'/);
  assert.match(shared, /role === 'creative'[\s\S]*post\.author_user_id === userId/);
  assert.doesNotMatch(shared, /r2CreativePostPermissionAllowed[\s\S]{0,180}super_admin/);
  assert.match(edge, /creative_post_id/);
  assert.match(upload, /r2CreativePostPermissionAllowed/);
});

test('empty composers stay local and owned drafts can be deleted directly', () => {
  const editor = source('src/pages/CreativePostEditor.jsx');
  const card = source('src/components/CreativePostCard.jsx');
  const migration = source('supabase/migrations/20260814190000_inline_profile_and_draft_cleanup.sql');
  assert.match(editor, /create \? \{ id: null, status: 'draft'/);
  assert.match(editor, /creativePostHasContent/);
  assert.match(editor, /Start writing to save/);
  assert.match(card, /Delete draft/);
  assert.match(migration, /post\.status not in \('draft','archived'\)/);
  assert.match(migration, /status in \('draft','archived'\)/);
});
