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
  for (const field of ['homeIcon', 'discoverIcon', 'creativesIcon', 'inquiryIcon', 'contactIcon']) assert.match(studio, new RegExp(field));
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
