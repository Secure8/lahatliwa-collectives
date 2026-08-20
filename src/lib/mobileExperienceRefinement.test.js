import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('public mobile navigation removes redundant Work and Portfolio destinations', async () => {
  const [component, navbar, app, styles] = await Promise.all([source('../components/MobileTopNavigation.jsx'), source('../components/Navbar.jsx'), source('../App.jsx'), source('../index.css')]);
  assert.match(component, /data-mobile-top-navigation/);
  assert.match(component, /\['Creatives', '\/creatives'/);
  assert.match(component, /\['Start a project', '\/inquiry'/);
  assert.doesNotMatch(component, /'Work', '\/work'|'Portfolio', '\/projects'|'Services', '\/services'/);
  assert.match(component, /aria-current=\{active\(href\) \? 'page'/);
  assert.match(component, /House/);
  assert.match(component, /UsersRound/);
  assert.match(navbar, /<MobileTopNavigation \/>/);
  assert.doesNotMatch(app, /MobileBottomNavigation/);
  assert.match(component, /gridTemplateColumns: `repeat\(\$\{links\.length\}/);
  assert.match(styles, /@media \(max-width: 420px\)/);
});

test('public navigation exposes Contact and Privacy directly without a More menu', async () => {
  const [navbar, mobile, styles] = await Promise.all([source('../components/Navbar.jsx'), source('../components/MobileTopNavigation.jsx'), source('../index.css')]);
  assert.match(navbar, /navigation\.contactLabel \|\| 'Contact'/);
  assert.match(navbar, /navigation\.privacyLabel \|\| 'Privacy'/);
  assert.doesNotMatch(navbar, /More pages|public-more-menu|ll-public-menu-layer/);
  assert.match(mobile, /\['Contact', '\/contact', Mail\]/);
  assert.match(mobile, /\['Privacy', '\/privacy', ShieldCheck\]/);
  assert.match(styles, /\.ll-post-card\.has-open-menu \{ overflow: visible/);
});

test('moderation actions use compact icon controls with accessible labels', async () => {
  const [moderation, styles] = await Promise.all([source('../pages/admin/AdminPostModeration.jsx'), source('../index.css')]);
  assert.match(moderation, /role="toolbar"/);
  assert.match(moderation, /MessageSquareWarning/);
  assert.match(moderation, /data-action=\{action\}/);
  assert.match(moderation, /aria-label=\{`\$\{label\}: \$\{hint\}`\}/);
  assert.match(styles, /\.ll-moderation-actions button > span[\s\S]*?border-radius: 50%/);
});

test('mobile Home is a fluid feed with no artificial item limit', async () => {
  const [home, feed, styles, app] = await Promise.all([source('../pages/Home.jsx'), source('../components/CreativeFeed.jsx'), source('../index.css'), source('../App.jsx')]);
  assert.match(home, /data-creative-network-home/);
  assert.match(home, /loadPublicCreativeFeed/);
  assert.doesNotMatch(home, /fetchPublicProjectSummaries\(\)/);
  assert.match(feed, /mergeCreativeFeed/);
  assert.match(feed, /CreativePostCard/);
  assert.doesNotMatch(home, /ActiveWorkHero|home-creatives-grid/);
  assert.match(styles, /\.ll-feed-list/);
  assert.match(app, /<Footer \/>/);
});

test('admin uses a compact responsive operations window instead of a permanent sidebar', async () => {
  const [admin, dashboard, styles] = await Promise.all([source('../components/admin/AdminLayout.jsx'), source('../pages/admin/Dashboard.jsx'), source('../index.css')]);
  assert.match(admin, /ll-operations-window__nav/);
  assert.match(admin, /aria-label="Platform tools"/);
  assert.doesNotMatch(admin, /useModalDrawer|role="dialog"/);
  assert.doesNotMatch(admin, /lg:w-64|lg:ml-64/);
  assert.match(dashboard, /aria-label="Primary actions"/);
  assert.match(styles, /\.ll-operations-window__nav/);
});

test('Creative inquiry remains a single accessible form with contextual project support', async () => {
  const form = await source('../pages/StartProject.jsx');
  assert.match(form, /Creative inquiry form/);
  assert.match(form, /data-inquiry-field/);
  assert.match(form, /projectContext/);
  assert.doesNotMatch(form, /role="progressbar"|data-flow-step/);
});

test('project cards remain square, fully linked, and height-safe', async () => {
  const [grid, card] = await Promise.all([source('../components/ProjectGrid.jsx'), source('../components/ProjectCard.jsx')]);
  assert.match(grid, /ll-portfolio-grid/);
  assert.match(card, /ll-portfolio-card__link/);
  assert.match(card, /aspect-square/);
  assert.doesNotMatch(card, /h-\[\d+px\]/);
});

test('long admin forms and dialogs retain touch-safe shared components', async () => {
  const [ui, dialog, styles] = await Promise.all([source('../components/admin/AdminUI.jsx'), source('../components/admin/AdminDialog.jsx'), source('../index.css')]);
  assert.match(ui, /ResponsiveFormSection/);
  assert.match(ui, /StickyMobileActions/);
  assert.match(dialog, /useModalDrawer/);
  assert.match(dialog, /h-dvh/);
  assert.match(styles, /safe-area-inset-bottom/);
});
