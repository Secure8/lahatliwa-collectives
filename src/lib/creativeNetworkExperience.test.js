import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Home is a curated Work surface, not a social or tourism feed', () => {
  const home = read('src/pages/Home.jsx');
  const feed = read('src/components/CreativeFeed.jsx');
  const posts = read('src/lib/creativePosts.js');
  assert.match(home, /data-creative-network-home/);
  assert.match(home, /loadPublicCreativeFeed/);
  assert.doesNotMatch(home, /fetchPublicProjectSummaries/);
  assert.match(feed, /Selected work/);
  assert.match(feed, /sort\(\(a, b\) => publishedTime\(b\) - publishedTime\(a\)\)/);
  assert.match(posts, /moderation_status', 'clear'/);
  assert.doesNotMatch(home, /Tourism|ActiveWorkHero|ExploreAklanHero/);
});

test('Creative profiles behave as portfolios with owner-only controls', () => {
  const profile = read('src/components/CreativeProfileView.jsx');
  const account = read('src/pages/AccountLanding.jsx');
  assert.match(profile, /Portfolio/);
  assert.match(profile, /Selected work/);
  assert.match(profile, /isOwner && !adminPreview/);
  assert.match(profile, /Add work/);
  assert.match(profile, /Portfolio style/);
  assert.match(profile, /CreativeInlineField/);
  assert.match(profile, /Direct inquiry/);
  assert.match(account, /CreativeWorkspace/);
});

test('post composition hides CMS structure behind a natural autosaving canvas', () => {
  const editor = read('src/pages/CreativePostEditor.jsx');
  assert.match(editor, /ll-natural-canvas/);
  assert.match(editor, /Saving…/);
  assert.match(editor, /> Saved/);
  assert.match(editor, /saveCreativePost/);
  assert.match(editor, /1100/);
  assert.match(editor, /Add to post/);
  assert.match(editor, /Insert photos/);
  assert.match(editor, /CREATIVE_POST_MAX_IMAGES/);
  assert.match(editor, /role="toolbar" aria-label="Text formatting"/);
  assert.doesNotMatch(editor, />PARAGRAPH<|>IMAGE GROUP<|permanent sidebar/i);
});

test('adaptive media and lightbox provide modern accessible gallery behavior', () => {
  const gallery = read('src/components/CreativePostGallery.jsx');
  const styles = read('src/index.css');
  assert.match(gallery, /ll-adaptive-gallery--\$\{Math\.min\(items\.length, 5\)\}/);
  assert.match(gallery, /\+\{items\.length - visible\.length\}/);
  assert.match(gallery, /role="dialog"/);
  assert.match(gallery, /aria-modal="true"/);
  assert.match(gallery, /ChevronLeft|ChevronRight/);
  assert.match(gallery, /event\.key === 'Escape'/);
  assert.match(gallery, /event\.key === 'Tab'/);
  assert.match(gallery, /touchStart/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Super Admin remains operational, role-separated, and free of a permanent sidebar', () => {
  const app = read('src/App.jsx');
  const layout = read('src/components/admin/AdminLayout.jsx');
  const moderation = read('src/pages/admin/AdminPostModeration.jsx');
  assert.match(app, /AdminRouteGuard allow=\{\['super_admin'\]\}/);
  assert.match(layout, /Platform tools|Super Admin/);
  assert.match(layout, /ll-operations-window__nav/);
  assert.match(layout, /Moderation/);
  assert.doesNotMatch(layout, /lg:w-64|lg:ml-64|fixed left-0/);
  assert.match(moderation, /request_changes|hide|restore|remove/);
});

test('production content alignment preserves infrastructure while changing product language', () => {
  const migration = read('supabase/migrations/20260814130000_creative_network_content_alignment.sql');
  assert.match(migration, /Creative feed/);
  assert.match(migration, /professional creative network/);
  assert.match(migration, /website_studio_entries/);
  assert.doesNotMatch(migration, /drop\s+(table|schema|database)|delete\s+from\s+storage/i);
});
