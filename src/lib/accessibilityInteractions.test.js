import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moveProjectByOffset } from './adminProjectOrdering.js';
import { shouldBlockUnsavedNavigation } from './unsavedNavigation.js';

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:js|jsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

test('public routes render inside one main landmark and expose a skip link', async () => {
  const [app, projects, inquiry] = await Promise.all([
    source('../App.jsx'),
    source('../pages/Projects.jsx'),
    source('../pages/StartProject.jsx'),
  ]);
  assert.match(app, /href="#public-main-content"/);
  assert.match(app, /<main id="public-main-content" tabIndex=\{-1\}/);
  assert.doesNotMatch(projects, /<main\b/);
  assert.doesNotMatch(inquiry, /<main\b/);
  assert.match(inquiry, /aria-labelledby="inquiry-step-heading"/);
});

test('shared admin dialog carries accessible modal behavior', async () => {
  const [dialog, drawer] = await Promise.all([
    source('../components/admin/AdminDialog.jsx'),
    source('./useModalDrawer.js'),
  ]);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /aria-describedby=/);
  assert.match(dialog, /aria-busy=/);
  assert.match(dialog, /safe-area-inset-bottom/);
  assert.match(dialog, /motion-reduce/);
  assert.match(dialog, /confirmationText/);
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /event\.key !== 'Tab'/);
  assert.match(drawer, /previouslyFocused.*focus\(\)/);
  assert.match(drawer, /document\.body\.style\.overflow = 'hidden'/);
});

test('admin screens use shared confirmation instead of browser confirm', async () => {
  const files = await sourceFiles(fileURLToPath(new URL('../', import.meta.url)));
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  assert.doesNotMatch(contents.join('\n'), /window\.confirm/);
  const [inquiries, team] = await Promise.all([
    source('../pages/admin/AdminInquiries.jsx'),
    source('../pages/admin/AdminTeam.jsx'),
  ]);
  assert.match(inquiries, /AdminDialog/);
  assert.match(team, /AdminDialog/);
});

test('featured project order supports first, middle, and last keyboard moves', () => {
  const projects = [{ id: 'first' }, { id: 'middle' }, { id: 'last' }];
  assert.equal(moveProjectByOffset(projects, 'first', -1), projects);
  assert.deepEqual(moveProjectByOffset(projects, 'first', 1).map(({ id }) => id), ['middle', 'first', 'last']);
  assert.deepEqual(moveProjectByOffset(projects, 'middle', -1).map(({ id }) => id), ['middle', 'first', 'last']);
  assert.deepEqual(moveProjectByOffset(projects, 'middle', 1).map(({ id }) => id), ['first', 'last', 'middle']);
  assert.equal(moveProjectByOffset(projects, 'last', 1), projects);
});

test('unsaved navigation only blocks meaningful location changes while dirty', () => {
  const currentLocation = { pathname: '/admin/settings', search: '', hash: '' };
  assert.equal(shouldBlockUnsavedNavigation({ dirty: false, currentLocation, nextLocation: { ...currentLocation, pathname: '/admin/dashboard' } }), false);
  assert.equal(shouldBlockUnsavedNavigation({ dirty: true, currentLocation, nextLocation: currentLocation }), false);
  assert.equal(shouldBlockUnsavedNavigation({ dirty: true, currentLocation, nextLocation: { ...currentLocation, pathname: '/admin/dashboard' } }), true);
  assert.equal(shouldBlockUnsavedNavigation({ dirty: true, currentLocation, nextLocation: { ...currentLocation, search: '?tab=media' } }), true);
});

test('admin shell exposes navigation labels, skip target, and route-aware titles', async () => {
  const [layout, searchBar, card, guard] = await Promise.all([
    source('../components/admin/AdminLayout.jsx'),
    source('../components/SearchBar.jsx'),
    source('../components/CreativeCard.jsx'),
    source('../components/admin/UnsavedChangesGuard.jsx'),
  ]);
  assert.match(layout, /href="#admin-main-content"/);
  assert.match(layout, /aria-label="Primary admin navigation"/);
  assert.match(layout, /document\.title =/);
  assert.match(searchBar, /type="search"/);
  assert.match(searchBar, /aria-label=\{label\}/);
  assert.match(card, /headingLevel/);
  assert.match(card, /border-t border-white\/\[0\.09\][\s\S]*?after:bg-orange-300/);
  assert.match(card, /border-b border-white\/\[0\.12\]/);
  assert.match(guard, /useBlocker/);
  assert.match(guard, /beforeunload/);
  assert.match(guard, /AdminConfirmationDialog/);
});

test('admin visual hierarchy distinguishes content, controls, status, and navigation', async () => {
  const [ui, layout, styles, contentEditor] = await Promise.all([
    source('../components/admin/AdminUI.jsx'),
    source('../components/admin/AdminLayout.jsx'),
    source('../index.css'),
    source('../pages/admin/ContentEditor.jsx'),
  ]);
  assert.match(ui, /admin-page-header[\s\S]*?border-b border-white/);
  assert.match(ui, /admin-form-section[\s\S]*?rounded-lg[\s\S]*?bg-zinc-900/);
  assert.match(ui, /data-admin-control/);
  assert.match(ui, /data-variant=\{variant\}/);
  assert.match(ui, /rounded-full[\s\S]*?bg-current/);
  assert.match(layout, /admin-sidebar-link/);
  assert.match(layout, /AdminCommandPalette/);
  assert.match(layout, /Studio OS/);
  assert.match(styles, /\.admin-shell article/);
  assert.match(styles, /interactive-tab\[aria-pressed="true"\]/);
  assert.match(styles, /admin-sidebar-link\[aria-current="page"\]/);
  assert.match(styles, /\[data-theme="light"\] \.admin-record-card/);
  assert.match(contentEditor, /rounded-lg border px-3 text-sm font-medium/);
});

test('adjacent admin content holders keep a small visual separation', async () => {
  const styles = await source('../index.css');
  assert.match(styles, /\.admin-form-section \+ \.admin-form-section,[\s\S]*?margin-top:\s*0\.625rem/);
  assert.match(styles, /\.admin-surface \+ \.admin-surface/);
  assert.match(styles, /\.admin-record-card \+ \.admin-record-card/);
  assert.match(styles, /\.grid > \.admin-surface \+ \.admin-surface,[\s\S]*?\.flex > \.admin-surface \+ \.admin-surface[\s\S]*?margin-top:\s*0/);
});

test('All projects and featured ordering use separated project card holders', async () => {
  const [projects, card, styles] = await Promise.all([
    source('../pages/admin/AdminProjects.jsx'),
    source('../components/admin/AdminProjectCard.jsx'),
    source('../index.css'),
  ]);
  assert.match(projects, /data-project-card-grid className="grid gap-3 p-4 sm:gap-4 sm:p-5"/);
  assert.match(projects, /data-featured-project-grid className="grid gap-3 sm:gap-4"/);
  assert.match(projects, /key=\{`featured-\$\{project\.id\}`\}[\s\S]*?onDelete=\{deleteProject\}[\s\S]*?separated[\s\S]*?draggable=/);
  assert.match(projects, /onDelete=\{deleteProject\} separated/);
  assert.match(card, /separated \? 'admin-project-box'/);
  assert.match(styles, /\.admin-shell article\.admin-project-box[\s\S]*?border-radius:\s*0\.5rem/);
  assert.match(styles, /\.grid > article \+ article,[\s\S]*?margin-top:\s*0/);
});

test('admin search fields render one boundary with a single restrained focus state', async () => {
  const [projects, creatives, directory, media, palette, styles] = await Promise.all([
    source('../pages/admin/AdminProjects.jsx'),
    source('../pages/admin/AdminCreatives.jsx'),
    source('../pages/admin/CreativeDirectory.jsx'),
    source('../pages/admin/IconsMedia.jsx'),
    source('../components/admin/AdminCommandPalette.jsx'),
    source('../index.css'),
  ]);
  for (const screen of [projects, creatives, directory, media, palette]) assert.match(screen, /data-search-shell/);
  assert.match(styles, /input\[type="search"\]:focus[\s\S]*?box-shadow:\s*none/);
  assert.match(styles, /\[data-search-shell\] > input\[type="search"\][\s\S]*?border:\s*0 !important[\s\S]*?box-shadow:\s*none !important/);
});

test('service branch admin previews reuse real uploaded public media without generated icons', async () => {
  const adminBranches = await source('../pages/admin/AdminServiceBranches.jsx');
  assert.match(adminBranches, /usePublicContent\(\['services'\]\)/);
  assert.match(adminBranches, /<BranchIconPreview branch=\{branch\} groups=\{content\.servicesPage\?\.groups\}/);
  assert.match(adminBranches, /groups\.find\(\(group\) => branchKeyFromRecord\(group\) === branchKey\)/);
  assert.match(adminBranches, /branch\.icon_url \|\| branch\.image_url \|\| publicGroup\?\.customIconUrl \|\| publicGroup\?\.iconUrl \|\| publicGroup\?\.serviceLogoUrl/);
  assert.doesNotMatch(adminBranches, /branch\.name\?\.slice\(0,1\)\|\|'L'/);
  assert.doesNotMatch(adminBranches, /serviceBranchIcon|<Icon size=/);
  assert.match(adminBranches, />No icon</);
});

test('dashboard prioritizes summary, urgent work, and a small primary action set', async () => {
  const dashboard = await source('../pages/admin/Dashboard.jsx');
  assert.match(dashboard, /aria-label="Primary actions"/);
  assert.match(dashboard, /Website Studio/);
  assert.match(dashboard, /Create a story/);
  assert.match(dashboard, /Review inquiries/);
  assert.match(dashboard, /Manage team/);
  assert.match(dashboard, /View live website/);
  assert.match(dashboard, /Needs attention/);
  assert.match(dashboard, />Overview</);
  assert.match(dashboard, /Recent work/);
  assert.match(dashboard, /\.slice\(0, 8\)/);
  assert.match(dashboard, /canManagePeople/);
});

test('admin command palette supports keyboard access, navigation search, and focus containment', async () => {
  const palette = await source('../components/admin/AdminCommandPalette.jsx');
  assert.match(palette, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(palette, /key\.toLowerCase\(\) === 'k'/);
  assert.match(palette, /role="dialog"/);
  assert.match(palette, /aria-modal="true"/);
  assert.match(palette, /useModalDrawer/);
  assert.match(palette, /Search pages and tools/);
});

test('admin people management connects profiles and access while preserving their responsibilities', async () => {
  const [layout, peopleNav, team, creatives, settings] = await Promise.all([
    source('../components/admin/AdminLayout.jsx'),
    source('../components/admin/AdminPeopleNav.jsx'),
    source('../pages/admin/AdminTeam.jsx'),
    source('../pages/admin/AdminCreatives.jsx'),
    source('../pages/admin/SiteSettings.jsx'),
  ]);
  assert.match(layout, /\['Content', \[/);
  assert.match(layout, /\['Team', \[/);
  assert.match(layout, /Website Studio[\s\S]*Editorial Studio[\s\S]*Projects[\s\S]*Creative Profiles/);
  assert.match(layout, /Team Members/);
  assert.match(peopleNav, /aria-label="People management"/);
  assert.match(team, /profile_image_url/);
  assert.match(team, /member\.avatar_url \|\| creatives\.find/);
  assert.match(team, /<AdminPeopleNav \/>/);
  assert.match(creatives, /<AdminPeopleNav \/>/);
  assert.match(creatives, /Linked Team Member/);
  assert.match(settings, /w-full max-w-6xl/);
  assert.doesNotMatch(settings, /title="Hero Appearance"/);
  assert.doesNotMatch(settings, /title="Image Display and Positioning"/);
});
