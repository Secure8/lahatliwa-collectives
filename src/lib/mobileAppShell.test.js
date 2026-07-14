import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { adminPageTitle, mobileAppBarVisibility, publicAppBarMode } from './mobileAppShell.js';

test('public app bar uses overlay only for visual-first routes', () => {
  assert.equal(publicAppBarMode('/'), 'overlay');
  assert.equal(publicAppBarMode('/creatives/mara'), 'overlay');
  assert.equal(publicAppBarMode('/services'), 'surface');
  assert.equal(publicAppBarMode('/projects/example'), 'surface');
  assert.equal(publicAppBarMode('/inquiry'), 'surface');
});

test('mobile app bar follows meaningful document scroll direction without reacting to jitter', () => {
  assert.deepEqual(mobileAppBarVisibility({ currentVisible: true, lastY: 30, nextY: 36 }), { visible: true, lastY: 30 });
  assert.deepEqual(mobileAppBarVisibility({ currentVisible: true, lastY: 30, nextY: 70 }), { visible: false, lastY: 70 });
  assert.deepEqual(mobileAppBarVisibility({ currentVisible: false, lastY: 70, nextY: 50 }), { visible: true, lastY: 50 });
  assert.deepEqual(mobileAppBarVisibility({ currentVisible: false, lastY: 50, nextY: 10 }), { visible: true, lastY: 10 });
  assert.deepEqual(mobileAppBarVisibility({ currentVisible: false, lastY: 100, nextY: 130, locked: true }), { visible: true, lastY: 130 });
});

test('admin mobile title follows the most specific permitted route', () => {
  const groups = [['Studio', [['Projects', '/admin/projects'], ['Inquiries', '/admin/inquiries']]]];
  assert.equal(adminPageTitle('/admin/projects/new', groups), 'Projects');
  assert.equal(adminPageTitle('/admin/inquiries', groups), 'Inquiries');
  assert.equal(adminPageTitle('/admin/unknown', groups), 'Dashboard');
});

test('public and admin drawers provide modal keyboard behavior and keep theme controls inside', async () => {
  const [navbar, admin, drawer, app, styles] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./useModalDrawer.js', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);

  for (const source of [navbar, admin]) {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /AppearanceMenuAction/);
    assert.match(source, /safe-area-inset-bottom/);
  }
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /event\.key !== 'Tab'/);
  assert.match(drawer, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(app, /data-public-app-content/);
  assert.match(styles, /public-app-content--surface/);
  assert.match(styles, /mobile-navigation-open \.theme-toggle--global/);
});

test('admin bar stays stable while the public app bar owns direction-aware scroll behavior', async () => {
  const [navbar, admin] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(navbar, /useMobileAppBar/);
  assert.match(navbar, /data-mobile-app-bar/);
  assert.match(admin, /admin-app-bar[\s\S]*?fixed inset-x-0 top-0/);
  assert.doesNotMatch(admin, /useMobileAppBar/);
});

test('existing manifest remains install-ready without introducing a service worker', async () => {
  const [manifest, sourceFiles] = await Promise.all([
    readFile(new URL('../../public/site.webmanifest', import.meta.url), 'utf8'),
    Promise.all([
      readFile(new URL('../main.jsx', import.meta.url), 'utf8'),
      readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    ]),
  ]);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.start_url, '/');
  assert.ok(parsed.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(parsed.icons.some((icon) => icon.sizes === '512x512'));
  assert.doesNotMatch(sourceFiles.join('\n'), /serviceWorker\.register|navigator\.serviceWorker/);
});
