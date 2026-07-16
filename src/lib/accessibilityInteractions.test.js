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

test('dashboard prioritizes summary, urgent work, and a small primary action set', async () => {
  const dashboard = await source('../pages/admin/Dashboard.jsx');
  assert.match(dashboard, /aria-label="Primary dashboard actions"/);
  assert.match(dashboard, /\.slice\(0, 3\)/);
  assert.match(dashboard, /lg:grid-cols-4/);
  assert.match(dashboard, /Needs attention/);
  assert.match(dashboard, /lg:col-span-8/);
  assert.match(dashboard, /lg:col-span-4/);
  assert.match(dashboard, /Currently public/);
  assert.match(dashboard, /min-h-32 min-w-0 flex-col gap-3/);
  assert.match(dashboard, /break-words[\s\S]*?leading-5/);
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
  assert.match(layout, /\['People', \[/);
  assert.match(layout, /Creative Profiles[\s\S]*Team Access/);
  assert.match(peopleNav, /aria-label="People management"/);
  assert.match(team, /profile_image_url/);
  assert.match(team, /member\.avatar_url \|\| creatives\.find/);
  assert.match(team, /<AdminPeopleNav \/>/);
  assert.match(creatives, /<AdminPeopleNav \/>/);
  assert.match(settings, /w-full max-w-6xl/);
  assert.doesNotMatch(settings, /title="Hero Appearance"/);
  assert.doesNotMatch(settings, /title="Image Display and Positioning"/);
});
