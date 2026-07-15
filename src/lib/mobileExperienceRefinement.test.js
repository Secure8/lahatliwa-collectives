import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('public and admin bottom navigation are mobile-only, safe-area aware, and keyboard-aware', async () => {
  const [component, app, admin, styles, keyboard] = await Promise.all([
    readFile(new URL('../components/MobileBottomNavigation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
    readFile(new URL('./useKeyboardVisibility.js', import.meta.url), 'utf8'),
  ]);
  assert.match(component, /data-mobile-bottom-navigation/);
  assert.match(component, /lg:hidden/);
  assert.match(component, /grid-cols-5/);
  assert.match(component, /aria-current=\{active \? 'page'/);
  assert.match(component, /safe-area-inset-bottom/);
  assert.match(component, /surfaceOpen/);
  assert.match(keyboard, /visualViewport/);
  assert.match(app, /<MobileBottomNavigation/);
  assert.match(admin, /data-admin-mobile-bottom-navigation/);
  assert.match(admin, /useKeyboardVisibility/);
  assert.match(admin, /grid-cols-5/);
  assert.match(admin, /aria-current=\{active \? 'page'/);
  assert.match(admin, /safe-area-inset-bottom/);
  assert.match(styles, /\.public-footer[\s\S]*?padding-bottom: calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)/);
});

test('mobile Home uses compact branch shortcuts and bounded preview rails while desktop sections remain available', async () => {
  const [home, styles, restoration] = await Promise.all([
    readFile(new URL('../pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
    readFile(new URL('./useHorizontalScrollRestoration.js', import.meta.url), 'utf8'),
  ]);
  assert.match(home, /home-mobile-branches[\s\S]*?lg:hidden/);
  assert.match(home, /PROJECT_BRANCHES\.map/);
  assert.match(home, /home-project-grid/);
  assert.match(home, /home-creatives-grid/);
  assert.match(home, /home-full-services[\s\S]*?hidden[\s\S]*?lg:block/);
  assert.match(home, /View all/);
  assert.match(styles, /\.home-project-grid,[\s\S]*?grid-auto-flow: column/);
  assert.match(styles, /\.home-project-grid > :nth-child\(n \+ 4\)/);
  assert.match(home, /home-featured-projects/);
  assert.match(home, /home-featured-creatives/);
  assert.match(restoration, /horizontalPositions\.set\(positionKey, element\.scrollLeft\)/);
  assert.match(restoration, /navigationType === 'POP'/);
  assert.match(restoration, /\[80, 200, 500, 1000\]/);
});

test('inquiry step changes target the workflow shell and never force the document to page top', async () => {
  const [form, hook] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./useStepScroll.js', import.meta.url), 'utf8'),
  ]);
  assert.match(form, /ref=\{inquiryContainerRef\}/);
  assert.match(form, /useStepScroll\(\{ containerRef: inquiryContainerRef, request: stepScrollRequest \}\)/);
  assert.doesNotMatch(form, /window\.scrollTo\(\{ top: 0/);
  assert.match(hook, /scrollIntoView\(\{ behavior: motionSafeScrollBehavior\(\), block: 'start' \}\)/);
  assert.match(hook, /prefers-reduced-motion: reduce/);
  assert.match(hook, /alreadyPositioned/);
  assert.match(form, /data-inquiry-field/);
  assert.match(form, /focus\(\{ preventScroll: true \}\)/);
});

test('project cards stretch equally on desktop without fixed mobile heights', async () => {
  const [grid, card, projects] = await Promise.all([
    readFile(new URL('../components/ProjectGrid.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ProjectCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Projects.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(grid, /grid items-stretch/);
  assert.match(card, /flex h-full[\s\S]*?flex-col/);
  assert.match(card, /project-card-body[\s\S]*?flex-1/);
  assert.match(card, /aspect-\[4\/3\]/);
  assert.doesNotMatch(card, /h-\[\d+px\]/);
  assert.match(projects, /<ProjectGrid projects=\{visible\}/);
});

test('admin keeps stable role-aware navigation, compact dashboard rails, and a one-handed primary bar', async () => {
  const [admin, dashboard, styles] = await Promise.all([
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/Dashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(admin, /groupLinks\.filter\(\(\[, , , canShow\]\) => canShow\(access\)\)/);
  assert.match(admin, /admin-app-bar[\s\S]*?fixed inset-x-0 top-0/);
  assert.match(admin, /mobilePrimaryLinks/);
  assert.match(admin, /profileDestination/);
  assert.match(admin, /Open all admin sections/);
  assert.match(dashboard, /admin-dashboard-grid/);
  assert.match(styles, /\.admin-dashboard-grid[\s\S]*?grid-auto-flow: column/);
});

test('long admin forms share mobile sections and sticky actions above the primary navigation', async () => {
  const [ui, projectForm, creativeEditor, branchEditor, settings, contentEditor, profile, styles] = await Promise.all([
    readFile(new URL('../components/admin/AdminUI.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/ProjectForm.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/CreativeEditor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/ServiceBranchEditor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/SiteSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/ContentEditor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/MyProfile.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(ui, /export function ResponsiveFormSection/);
  assert.match(ui, /export function StickyMobileActions/);
  assert.match(ui, /data-sticky-mobile-actions/);
  for (const source of [projectForm, creativeEditor, branchEditor, settings, contentEditor, profile]) {
    assert.match(source, /StickyMobileActions/);
    assert.match(source, /ResponsiveFormSection/);
  }
  assert.match(styles, /\[data-sticky-mobile-actions\][\s\S]*?bottom: calc\(3\.5rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /font-size: 1rem/);
});

test('inquiry details use a focus-trapped full-screen mobile dialog and a mobile confirmation sheet', async () => {
  const inquiries = await readFile(new URL('../pages/admin/AdminInquiries.jsx', import.meta.url), 'utf8');
  assert.match(inquiries, /useModalDrawer/);
  assert.match(inquiries, /h-dvh max-h-dvh/);
  assert.match(inquiries, /data-drawer-initial-focus/);
  assert.match(inquiries, /place-items-end[\s\S]*?sm:place-items-center/);
  assert.match(inquiries, /pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
});
