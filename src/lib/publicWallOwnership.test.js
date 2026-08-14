import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Creative owners manage published posts and primary projects from their wall', () => {
  const card = read('src/components/CreativePostCard.jsx');
  const profile = read('src/components/CreativeProfileView.jsx');
  const app = read('src/App.jsx');
  const migration = read('supabase/migrations/20260814230000_public_wall_permissions_and_image_position.sql');
  assert.match(card, /Delete post/);
  assert.match(profile, /onEditProject/);
  assert.match(profile, /onDeleteProject/);
  assert.match(app, /allow=\{\['super_admin','creative'\]\}><EditProject/);
  assert.match(migration, /credit\.is_primary=true/);
  assert.match(migration, /role in \('super_admin','creative'\)/);
});

test('Super Admin moderates public work without receiving Creative edit controls', () => {
  const card = read('src/components/CreativePostCard.jsx');
  const home = read('src/pages/Home.jsx');
  const bar = read('src/components/PublicAdminBar.jsx');
  const studio = read('src/pages/admin/WebsiteStudio.jsx');
  assert.match(card, /moderator && !owner/);
  assert.match(card, /Remove with note/);
  assert.match(home, /moderateCreativePost/);
  assert.match(home, /moderatePublicProject/);
  assert.match(bar, /Edit this page/);
  assert.match(studio, /ll-site-editor-preview/);
  assert.doesNotMatch(studio, /<AdminLayout>/);
});

test('feed projects show their primary Creative identity', () => {
  const feed = read('src/components/CreativeFeed.jsx');
  const projectData = read('src/lib/publicProjectData.js');
  assert.match(feed, /Published a formal project/);
  assert.match(feed, /author\.profileImageUrl/);
  assert.match(projectData, /profile_image_url/);
});

test('profile media supports user-controlled framing and quiet scrollbars', () => {
  const editor = read('src/components/CreativeInlineProfileEditor.jsx');
  const hero = read('src/components/CreativeHero.jsx');
  const css = read('src/index.css');
  assert.match(editor, /Move left or right/);
  assert.match(editor, /Move up or down/);
  assert.match(hero, /cover_image_position/);
  assert.match(css, /::-webkit-scrollbar \{ width: 4px/);
  assert.match(css, /backdrop-filter: none !important/);
});
