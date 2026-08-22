import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public Super Admin toolbar keeps editing focused and opens one tools hub', () => {
  const toolbar = read('components/PublicAdminToolbar.jsx');
  const platform = read('pages/admin/PlatformTools.jsx');
  const app = read('App.jsx');
  assert.doesNotMatch(toolbar, /Page text|Projects<|Inquiries<|Moderation<|Join requests</);
  assert.match(toolbar, /Branding/);
  assert.match(toolbar, /Navigation/);
  assert.match(toolbar, /Colors/);
  assert.match(toolbar, /Contact/);
  assert.match(toolbar, /MoreHorizontal/);
  assert.match(toolbar, /to="\/admin\/dashboard"/);
  assert.match(platform, /<AdminLayout>/);
  assert.match(app, /<PlatformTools \/>/);
});

test('brand and navigation controls edit directly from the public experience', () => {
  const navbar = read('components/Navbar.jsx');
  const studio = read('lib/websiteStudio.js');
  const navigation = read('lib/publicNavigation.js');
  assert.match(navbar, /Edit logo and branding/);
  assert.match(navbar, /section=global\.brand/);
  for (const field of ['homeIcon', 'discoverIcon', 'creativesIcon', 'inquiryIcon']) assert.match(studio, new RegExp(field));
  assert.doesNotMatch(studio, /contactIcon|showContact/);
  assert.match(navigation, /publicNavigationItems/);
  assert.match(navigation, /navigation\.inquiryLabel \|\| 'Collab'/);
});

test('mobile creation is a separate floating action and no longer a dock destination', () => {
  const mobile = read('components/MobileTopNavigation.jsx');
  const styles = read('index.css');
  assert.match(mobile, /ll-mobile-create-fab/);
  assert.doesNotMatch(mobile, /\[\['Create', '\/create'/);
  assert.match(styles, /\.ll-mobile-create-fab/);
  assert.match(styles, /bottom: calc\(4\.35rem \+ env\(safe-area-inset-bottom\)\)/);
});

test('Super Admin edits public wording in an anchored field without leaving the page', () => {
  const editor = read('components/InlineWebsiteText.jsx');
  const home = read('pages/Home.jsx');
  const discover = read('pages/Discover.jsx');
  const header = read('components/PublicPageHeader.jsx');
  const styles = read('index.css');
  const migration = read('../supabase/migrations/20260821120000_inline_public_text_editing.sql');
  assert.match(editor, /createPortal/);
  assert.match(editor, /getBoundingClientRect/);
  assert.match(editor, /saveWebsiteDraft/);
  assert.match(editor, /publishWebsiteEntry/);
  assert.doesNotMatch(editor, /admin\/website|useNavigate|<Link/);
  assert.match(home, /eyebrowField: 'heroEyebrow'/);
  assert.match(home, /titleField: 'heroTitle'/);
  assert.match(home, /descriptionField: 'heroDescription'/);
  assert.match(discover, /section: 'page\.discover'/);
  assert.match(header, /InlineWebsiteText/);
  assert.match(styles, /\.ll-live-edit-popover/);
  assert.match(migration, /'page\.discover'/);
});

test('public page covers share one responsive header and publish independently in place', () => {
  const imageEditor = read('components/InlineWebsiteImage.jsx');
  const header = read('components/PublicPageHeader.jsx');
  const studio = read('lib/websiteStudio.js');
  const styles = read('index.css');
  for (const section of ['page.home', 'page.discover', 'page.creatives', 'page.inquiries', 'page.about', 'page.privacy']) {
    assert.match(studio, new RegExp(section.replace('.', '\\.')));
  }
  assert.match(studio, /heroBackgroundImageUrl/);
  assert.match(header, /ll-page-hero/);
  assert.match(header, /InlineWebsiteImage/);
  assert.match(imageEditor, /page-covers/);
  assert.match(imageEditor, /saveWebsiteDraft/);
  assert.match(imageEditor, /publishWebsiteEntry/);
  assert.match(styles, /\.ll-page-hero/);
  assert.match(styles, /min-height: clamp\(22rem, 35vw, 30rem\)/);
});
