import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { adminPageTitle, createMobileAppBarScrollState, MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD, MOBILE_APP_BAR_SCROLL_JITTER_TOLERANCE, MOBILE_APP_BAR_SHOW_DISTANCE_THRESHOLD, MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY, mobileAppBarVisibility, PUBLIC_PRIMARY_DESTINATIONS, publicAppBarMode, publicDestinationIsActive } from './mobileAppShell.js';

test('legacy app-bar helpers remain stable for routes that still use them', () => {
  assert.equal(publicAppBarMode('/'), 'overlay');
  assert.equal(publicAppBarMode('/creatives/mara'), 'surface');
  assert.equal(publicDestinationIsActive('/projects/sample', '/projects'), true);
  assert.deepEqual(PUBLIC_PRIMARY_DESTINATIONS, [
    ['Home', '/'],
    ['Creatives', '/creatives'],
    ['Collab', '/inquiry'],
    ['Contact', '/contact'],
  ]);
});

test('mobile app bar intent calculation remains jitter resistant', () => {
  let state = createMobileAppBarScrollState({ lastY: 40 });
  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_SCROLL_JITTER_TOLERANCE - 1 });
  assert.equal(state.accumulatedDistance, 0);
  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD + 4 });
  assert.equal(state.visible, false);
  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD - MOBILE_APP_BAR_SHOW_DISTANCE_THRESHOLD });
  assert.equal(state.visible, true);
  state = mobileAppBarVisibility({ state, nextY: MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY });
  assert.equal(state.primaryVisible, true);
});

test('admin route title follows the most specific permitted route', () => {
  const groups = [['Platform', [['Projects', '/admin/projects'], ['Inquiries', '/admin/inquiries']]]];
  assert.equal(adminPageTitle('/admin/projects/new', groups), 'Projects');
  assert.equal(adminPageTitle('/admin/inquiries', groups), 'Inquiries');
  assert.equal(adminPageTitle('/admin/unknown', groups), 'Dashboard');
});

test('admin operations remain focused while public destinations stay direct', async () => {
  const [navbar, navigation, admin, drawer, styles] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./publicNavigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./useModalDrawer.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(navbar, /AppearanceMenuAction/);
  assert.doesNotMatch(navbar, /role="dialog"|public-more-menu|More pages/);
  assert.match(navigation, /'Contact', '\/contact'/);
  assert.doesNotMatch(navbar, /'Privacy', '\/privacy'|ShieldCheck/);
  assert.match(admin, /ll-operations-window/);
  assert.match(admin, /aria-label="Platform tools"/);
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /event\.key !== 'Tab'/);
  assert.match(styles, /\.ll-drawer-scrim/);
  assert.match(styles, /safe-area-inset-bottom/);
});

test('new mobile product shell stays intentional at phone and desktop breakpoints', async () => {
  const [mobile, navbar, admin, creative, styles, index] = await Promise.all([
    readFile(new URL('../components/MobileTopNavigation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/CreativeDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(mobile, /ll-mobile-dock/);
  assert.match(navbar, /ll-public-header/);
  assert.match(admin, /ll-operations-window/);
  assert.doesNotMatch(admin, /lg:w-64|lg:ml-64/);
  assert.doesNotMatch(creative, /pointermove|data-creative-profile-back/);
  assert.match(styles, /@media \(max-width: 420px\)/);
  assert.match(styles, /@media \(min-width: 900px\)/);
  assert.match(index, /name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
});

test('existing manifest remains install-ready without introducing a service worker', async () => {
  const [manifest, sourceFiles] = await Promise.all([
    readFile(new URL('../../public/site.webmanifest', import.meta.url), 'utf8'),
    Promise.all([readFile(new URL('../main.jsx', import.meta.url), 'utf8'), readFile(new URL('../App.jsx', import.meta.url), 'utf8')]),
  ]);
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.start_url, '/');
  assert.ok(parsed.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(parsed.icons.some((icon) => icon.sizes === '512x512'));
  assert.doesNotMatch(sourceFiles.join('\n'), /serviceWorker\.register|navigator\.serviceWorker/);
});
