import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('public and admin mobile navigation identify the current page without cluttering inactive icons', async () => {
  const [component, navbar, app, admin, styles] = await Promise.all([
    readFile(new URL('../components/MobileTopNavigation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(component, /data-mobile-top-navigation/);
  assert.match(component, /lg:hidden/);
  assert.match(component, /grid-cols-5/);
  assert.match(component, /aria-current=\{active \? 'page'/);
  assert.match(component, /mobile-nav-current-label/);
  assert.match(component, /House/);
  assert.match(component, /PanelsTopLeft/);
  assert.match(component, /GalleryHorizontalEnd/);
  assert.match(component, /UsersRound/);
  assert.match(component, /MessageSquarePlus/);
  assert.match(component, /usePublicContent/);
  assert.match(component, /navigation\.servicesLabel \|\| 'Services'/);
  assert.match(component, /navigation\.projectsLabel \|\| 'Projects'/);
  assert.match(component, /navigation\.creativesLabel \|\| 'Creatives'/);
  assert.doesNotMatch(component, /h-9 w-12 place-items-center rounded-xl/);
  assert.doesNotMatch(component, /active && 'bg-\[var\(--site-accent-surface\)\]'/);
  assert.match(navbar, /<MobileTopNavigation \/>/);
  assert.match(navbar, /AppearanceMenuAction[\s\S]*?iconOnly/);
  assert.doesNotMatch(app, /MobileBottomNavigation/);
  assert.match(admin, /data-admin-mobile-top-navigation/);
  assert.doesNotMatch(admin, /data-admin-mobile-bottom-navigation|useKeyboardVisibility/);
  assert.match(admin, /useMobileAppBar/);
  assert.match(admin, /grid-cols-5/);
  assert.match(admin, /aria-current=\{active \? 'page'/);
  assert.match(admin, /mobile-nav-current-label/);
  assert.match(navbar, /secondaryPageLabel/);
  assert.match(admin, /House/);
  assert.match(admin, /GalleryHorizontalEnd/);
  assert.match(admin, /MessagesSquare/);
  assert.match(admin, /CircleUserRound/);
  assert.match(admin, /Ellipsis/);
  assert.doesNotMatch(admin, /h-9 w-12 place-items-center rounded-xl/);
  assert.doesNotMatch(admin, /active && 'bg-amber-200\/\[0\.12\]'/);
  assert.match(styles, /\.mobile-nav-current-label[\s\S]*?font-size: 0\.6rem;/);
  const adminLockLinks = [...navbar.matchAll(/<Link\s+to="\/admin\/dashboard"[\s\S]*?<\/Link>/g)].map((match) => match[0]);
  assert.equal(adminLockLinks.length, 2);
  adminLockLinks.forEach((link) => assert.doesNotMatch(link, /rounded-(?:xl|full)|border-white|bg-white/));
  assert.match(styles, /\.public-app-content--surface[\s\S]*?padding-top: 0;/);
  assert.doesNotMatch(styles, /\.public-footer[\s\S]*?padding-bottom: calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)/);
});

test('mobile Home keeps the tourism order, bounded content, and shared footer', async () => {
  const [home, app, styles] = await Promise.all([
    readFile(new URL('../pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(home, /<ExploreAklanHero/);
  assert.match(home, /<DestinationsFeed/);
  assert.match(home, /home-creatives-grid/);
  assert.match(home, /home-featured-creatives/);
  assert.doesNotMatch(home, /ProjectGrid|home-project-grid|home-featured-projects/);
  assert.match(styles, /overflow-x: clip/);
  assert.match(app, /<Footer \/>/);
  assert.doesNotMatch(app, /hidden lg:block' : ''/);
});

test('inquiry step changes target the workflow shell and never force the document to page top', async () => {
  const [form, hook, progressive] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./useStepScroll.js', import.meta.url), 'utf8'),
    readFile(new URL('./useProgressiveNavigation.js', import.meta.url), 'utf8'),
  ]);
  assert.match(form, /ref=\{inquiryContainerRef\}/);
  assert.match(form, /useStepScroll\(\{ containerRef: inquiryContainerRef, request: stepScrollRequest \}\)/);
  assert.doesNotMatch(form, /window\.scrollTo\(\{ top: 0/);
  assert.match(hook, /scheduleProgressiveNavigation/);
  assert.match(progressive, /prefers-reduced-motion: reduce/);
  assert.match(progressive, /targetIsComfortablyVisible/);
  assert.match(progressive, /window\.addEventListener\('wheel', interrupt/);
  assert.match(form, /data-inquiry-field/);
  assert.match(form, /focus\(\{ preventScroll: true \}\)/);
  assert.match(form, /role="progressbar"/);
  assert.match(form, /aria-valuetext=\{`Step \$\{current \+ 1\} of \$\{steps\.length\}: \$\{steps\[current\]\}`\}/);
  assert.match(form, /sm:hidden/);
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

test('admin keeps stable role-aware navigation, a responsive dashboard, and a one-handed primary bar', async () => {
  const [admin, dashboard, styles] = await Promise.all([
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/Dashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(admin, /groupLinks\.filter\(\(\[, , , canShow\]\) => canShow\(access\)\)/);
  assert.match(admin, /admin-app-bar[\s\S]*?sticky inset-x-0 top-0[\s\S]*?lg:fixed/);
  assert.match(admin, /mobilePrimaryLinks/);
  assert.match(admin, /profileDestination/);
  assert.match(admin, /Open all admin sections/);
  assert.equal((admin.match(/onClick=\{\(\) => setMobileOpen\(true\)\}/g) || []).length, 1);
  assert.match(admin, /ref=\{triggerRef\}[\s\S]*?Open all admin sections/);
  assert.match(admin, /Studio OS[\s\S]*?currentPageTitle/);
  assert.match(admin, /AppearanceMenuAction[\s\S]*?iconOnly/);
  assert.match(dashboard, /aria-label="Primary actions"/);
  assert.match(dashboard, /sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(dashboard, />Overview</);
  assert.match(styles, /\.admin-record-actions[\s\S]*?grid-template-columns/);
});

test('long admin forms share mobile sections and sticky actions above the safe-area edge', async () => {
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
  assert.match(styles, /\[data-sticky-mobile-actions\][\s\S]*?bottom: env\(safe-area-inset-bottom\)/);
  assert.match(styles, /font-size: 1rem/);
});

test('inquiry details use a focus-trapped full-screen mobile dialog and a mobile confirmation sheet', async () => {
  const [inquiries, dialog] = await Promise.all([
    readFile(new URL('../pages/admin/AdminInquiries.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminDialog.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(inquiries, /presentation="fullscreen"/);
  assert.match(inquiries, /presentation="sheet"/);
  assert.match(dialog, /useModalDrawer/);
  assert.match(dialog, /h-dvh/);
  assert.match(dialog, /data-drawer-initial-focus/);
  assert.match(dialog, /items-end sm:items-center/);
  assert.match(dialog, /safe-area-inset-bottom/);
});
