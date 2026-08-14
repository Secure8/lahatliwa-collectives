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
  assert.match(inquiry, /aria-label=\{platformInquiry \? 'Platform contact form' : 'Creative inquiry form'\}/);
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

test('admin operations window exposes navigation labels, a content target, and route-aware titles', async () => {
  const [layout, searchBar, card, guard] = await Promise.all([
    source('../components/admin/AdminLayout.jsx'),
    source('../components/SearchBar.jsx'),
    source('../components/CreativeCard.jsx'),
    source('../components/admin/UnsavedChangesGuard.jsx'),
  ]);
  assert.match(layout, /id="admin-main-content"/);
  assert.match(layout, /aria-label="Platform tools"/);
  assert.match(layout, /document\.title =/);
  assert.match(searchBar, /type="search"/);
  assert.match(searchBar, /aria-label=\{label\}/);
  assert.match(card, /headingLevel/);
  assert.match(card, /ll-creative-mini/);
  assert.match(card, /aria-label=\{`View \$\{creative\.name\}`\}/);
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
  assert.match(layout, /ll-operations-window__nav/);
  assert.doesNotMatch(layout, /AdminCommandPalette/);
  assert.match(layout, /Platform tools/);
  assert.match(styles, /\.ll-operations-window__body/);
  assert.match(styles, /interactive-tab\[aria-pressed="true"\]/);
  assert.match(styles, /\.ll-operations-window__nav a\.is-active/);
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

test('Super Admin projects are a read-only public-work overview', async () => {
  const [projects, styles] = await Promise.all([
    source('../pages/admin/AdminProjects.jsx'),
    source('../index.css'),
  ]);
  assert.match(projects, /read-only view of Creative work/);
  assert.match(projects, /ll-project-review-list/);
  assert.doesNotMatch(projects, /deleteProject|Delete project|AdminProjectCard/);
  assert.match(styles, /\.ll-project-review-list__item/);
});

test('admin search fields render one boundary with a single restrained focus state', async () => {
  const [projects, creatives, styles] = await Promise.all([
    source('../pages/admin/AdminProjects.jsx'),
    source('../pages/admin/AdminCreatives.jsx'),
    source('../index.css'),
  ]);
  assert.match(projects, /ll-simple-search/);
  assert.match(creatives, /data-search-shell/);
  assert.match(styles, /input\[type="search"\]:focus[\s\S]*?box-shadow:\s*none/);
  assert.match(styles, /\[data-search-shell\] > input\[type="search"\][\s\S]*?border:\s*0 !important[\s\S]*?box-shadow:\s*none !important/);
});

test('dashboard prioritizes summary, urgent work, and a small primary action set', async () => {
  const dashboard = await source('../pages/admin/Dashboard.jsx');
  assert.match(dashboard, /aria-label="Primary actions"/);
  assert.match(dashboard, /Website/);
  assert.match(dashboard, /Create project/);
  assert.match(dashboard, /Update current work/);
  assert.match(dashboard, /Review inquiries/);
  assert.match(dashboard, /Moderation/);
  assert.match(dashboard, /Manage team/);
  assert.match(dashboard, /View live website/);
  assert.match(dashboard, /Needs attention/);
  assert.match(dashboard, />Overview</);
  assert.match(dashboard, /Recent work/);
  assert.match(dashboard, /\.slice\(0, 8\)/);
  assert.match(dashboard, /canManagePeople/);
});

test('admin navigation stays direct and avoids a hidden command layer', async () => {
  const layout = await source('../components/admin/AdminLayout.jsx');
  assert.doesNotMatch(layout, /AdminCommandPalette|metaKey|ctrlKey|Search pages and tools/);
  assert.match(layout, /aria-label="Platform tools"/);
  assert.match(layout, /Projects[\s\S]*Inquiries[\s\S]*Moderation[\s\S]*Join requests/);
  assert.doesNotMatch(layout, /admin-navigation-drawer|useModalDrawer/);
});

test('public join requests replace the legacy people-management dashboard', async () => {
  const [layout, joinPage, reviewPage, migration] = await Promise.all([
    source('../components/admin/AdminLayout.jsx'),
    source('../pages/JoinCreative.jsx'),
    source('../pages/admin/CreativeJoinRequests.jsx'),
    source('../../supabase/migrations/20260815010000_public_creative_join_requests.sql'),
  ]);
  assert.match(layout, /Join requests/);
  assert.doesNotMatch(layout, /Accounts|Team Members|Add Member/);
  assert.match(joinPage, /submit_creative_join_request/);
  assert.match(joinPage, /else if \(!data\)/);
  assert.match(joinPage, /Request \{requestId\.slice/);
  assert.match(reviewPage, /approve_request/);
  assert.match(reviewPage, /visibilitychange/);
  assert.match(reviewPage, /creative-join-requests-admin/);
  assert.match(reviewPage, /Refreshing…/);
  assert.match(migration, /create table if not exists public\.creative_join_requests/);
});
