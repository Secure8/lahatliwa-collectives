import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { adminPageTitle, createMobileAppBarScrollState, MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD, MOBILE_APP_BAR_SCROLL_JITTER_TOLERANCE, MOBILE_APP_BAR_SHOW_DISTANCE_THRESHOLD, MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY, mobileAppBarVisibility, PUBLIC_PRIMARY_DESTINATIONS, publicAppBarMode, publicDestinationIsActive } from './mobileAppShell.js';

test('public app bar uses overlay only for visual-first routes', () => {
  assert.equal(publicAppBarMode('/'), 'overlay');
  assert.equal(publicAppBarMode('/creatives/mara'), 'surface');
  assert.equal(publicAppBarMode('/services'), 'surface');
  assert.equal(publicAppBarMode('/projects/example'), 'surface');
  assert.equal(publicAppBarMode('/inquiry'), 'surface');
});

test('mobile app bar follows accumulated scroll intent instead of raw direction changes', () => {
  let state = createMobileAppBarScrollState({ lastY: 40 });
  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_SCROLL_JITTER_TOLERANCE - 1 });
  assert.equal(state.visible, true);
  assert.equal(state.accumulatedDistance, 0);

  state = mobileAppBarVisibility({ state, nextY: 55 });
  state = mobileAppBarVisibility({ state, nextY: 70 });
  assert.equal(state.visible, true);
  assert.equal(state.accumulatedDistance, 27);
  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD + 4 });
  assert.equal(state.visible, false);
  assert.equal(state.primaryVisible, false);
  assert.equal(state.accumulatedDistance, 0);

  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD });
  assert.equal(state.visible, false);
  state = mobileAppBarVisibility({ state, nextY: 40 + MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD - MOBILE_APP_BAR_SHOW_DISTANCE_THRESHOLD });
  assert.equal(state.visible, true);
  assert.equal(state.primaryVisible, false);

  state = mobileAppBarVisibility({ state, nextY: MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY });
  assert.equal(state.visible, true);
  assert.equal(state.primaryVisible, true);
  assert.equal(state.accumulatedDistance, 0);
  assert.equal(state.direction, 0);
  state = mobileAppBarVisibility({ state: { ...state, visible: false }, nextY: 0 });
  assert.equal(state.visible, true);
});

test('mobile app bar resets accumulated intent on a meaningful direction change and interaction lock', () => {
  let state = createMobileAppBarScrollState({ lastY: 100 });
  state = mobileAppBarVisibility({ state, nextY: 118 });
  assert.equal(state.accumulatedDistance, 18);
  state = mobileAppBarVisibility({ state, nextY: 108 });
  assert.equal(state.direction, -1);
  assert.equal(state.accumulatedDistance, 10);
  assert.equal(state.visible, true);
  state = mobileAppBarVisibility({ state: { ...state, visible: false }, nextY: 140, locked: true });
  assert.deepEqual(state, createMobileAppBarScrollState({ lastY: 140 }));
});

test('public top navigation is limited to five primary destinations with detail-route awareness', () => {
  assert.deepEqual(PUBLIC_PRIMARY_DESTINATIONS.map(([label]) => label), ['Home', 'Services', 'Projects', 'Creatives', 'Inquiry']);
  assert.equal(PUBLIC_PRIMARY_DESTINATIONS.length, 5);
  assert.equal(publicDestinationIsActive('/projects/sample', '/projects'), true);
  assert.equal(publicDestinationIsActive('/creatives/sample', '/creatives'), true);
  assert.equal(publicDestinationIsActive('/inquiry/confirmation/ABC', '/inquiry'), true);
  assert.equal(publicDestinationIsActive('/about', '/'), false);
});

test('admin mobile title follows the most specific permitted route', () => {
  const groups = [['Studio', [['Projects', '/admin/projects'], ['Inquiries', '/admin/inquiries']]]];
  assert.equal(adminPageTitle('/admin/projects/new', groups), 'Projects');
  assert.equal(adminPageTitle('/admin/inquiries', groups), 'Inquiries');
  assert.equal(adminPageTitle('/admin/unknown', groups), 'Dashboard');
});

test('public and admin drawers provide modal keyboard behavior while mobile theme controls stay reachable', async () => {
  const [navbar, footer, admin, drawer, app, styles] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Footer.jsx', import.meta.url), 'utf8'),
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
  assert.match(navbar, /mobileSecondaryLinks/);
  assert.match(navbar, /aria-label="Secondary mobile navigation"/);
  assert.doesNotMatch(navbar, /mobileSecondaryLinks[\s\S]*?\['Home', '\/'\]/);
  assert.match(navbar, /LockKeyhole/);
  assert.match(navbar, /to="\/admin\/dashboard"/);
  assert.match(navbar, /AppearanceMenuAction[\s\S]*?iconOnly/);
  assert.doesNotMatch(footer, /to="\/admin\/dashboard"|Platform admin access/);
  assert.match(admin, /AppearanceMenuAction[\s\S]*?iconOnly/);
  assert.match(admin, /data-admin-mobile-top-navigation[\s\S]*?min-h-\[3\.25rem\]/);
  assert.match(admin, /aria-current=\{active \? 'page'[\s\S]*?mobile-nav-item/);
  assert.match(admin, /mobile-nav-current-label[\s\S]*?\{label\}/);
  assert.match(admin, /moreIsActive \? morePageLabel : 'More'/);
  assert.match(navbar, /secondaryRouteIsActive[\s\S]*?aria-current=\{secondaryRouteIsActive \? 'page'/);
  assert.match(navbar, /mobile-nav-current-label[\s\S]*?secondaryPageLabel/);
  assert.match(styles, /\.mobile-nav-item\[aria-current="page"\][\s\S]*?color: #fb923c !important;/);
  assert.match(styles, /\.mobile-nav-item\[aria-current="page"\] \.mobile-nav-icon[\s\S]*?fill: currentColor;/);
  assert.match(styles, /\.mobile-nav-item\[aria-current="page"\] \.mobile-nav-current-label[\s\S]*?opacity: 1;/);
  assert.doesNotMatch(admin, /data-admin-mobile-bottom-navigation/);
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /event\.key !== 'Tab'/);
  assert.match(drawer, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(app, /data-public-app-content/);
  assert.match(styles, /public-app-content--surface/);
  assert.match(styles, /mobile-navigation-open \.theme-toggle--global/);
});

test('public and admin mobile app bars share direction-aware scroll behavior', async () => {
  const [navbar, admin, creative, styles] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/CreativeDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(navbar, /useMobileAppBar/);
  assert.match(navbar, /data-mobile-app-bar/);
  assert.match(navbar, /isPrimaryHeaderVisible = mobileAppBar\.primaryVisible/);
  assert.match(navbar, /isSecondaryNavVisible = mobileAppBar\.visible/);
  assert.match(navbar, /data-public-mobile-primary/);
  assert.match(navbar, /data-public-mobile-secondary/);
  assert.match(navbar, /data-primary-visible=\{isPrimaryHeaderVisible \? 'true' : 'false'\}/);
  assert.match(navbar, /public-app-bar[\s\S]*?sticky inset-x-0 top-0/);
  assert.match(admin, /useMobileAppBar/);
  assert.match(admin, /data-admin-mobile-app-bar/);
  assert.match(admin, /data-mobile-visible=\{mobileVisible \? 'true' : 'false'\}/);
  assert.match(admin, /admin-app-bar[\s\S]*?sticky inset-x-0 top-0[\s\S]*?lg:fixed/);
  assert.match(admin, /admin-app-content[\s\S]*?pt-4[\s\S]*?lg:pt-24/);
  assert.match(admin, /locked: mobileOpen \|\| headerFocused/);
  assert.match(admin, /mobileVisible \? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'/);
  assert.match(creative, /useMobileAppBar/);
  assert.match(creative, /data-creative-profile-back/);
  assert.match(creative, /data-mobile-visible=\{mobileTopControlsVisible \? 'true' : 'false'\}/);
  assert.match(styles, /\[data-creative-profile-back\]\[data-mobile-visible="false"\][\s\S]*?opacity: 0;/);
  assert.match(styles, /--mobile-app-bar-hide-duration: 220ms;/);
  assert.match(styles, /--mobile-app-bar-show-duration: 180ms;/);
  assert.match(styles, /will-change: transform, opacity;/);
  assert.match(styles, /\[data-public-mobile-secondary\]\[data-mobile-visible="true"\]\[data-primary-visible="false"\][\s\S]*?translateY\(-3\.5rem\)/);
  assert.match(styles, /\.public-app-content--surface[\s\S]*?padding-top: 0;/);
  assert.match(navbar, /motion-reduce:transition-none/);
  assert.match(admin, /motion-reduce:transition-none/);
  assert.match(creative, /motion-reduce:transition-none/);
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
