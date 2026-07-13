import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { cachedContentMatchesScope, publicContentScope } from './publicContentScope.js';
import { safeExternalUrl, safeInternalPath } from './externalUrls.js';
import { socialLinkMeta } from './socialLinks.js';

const root = resolve(import.meta.dirname, '../..');

test('public CMS cache identity is exact, stable, and page-specific', () => {
  assert.equal(publicContentScope(['services', 'home', 'home']), 'home|services');
  assert.notEqual(publicContentScope(['about']), publicContentScope(['contact']));
  assert.equal(cachedContentMatchesScope({ scope: 'about', content: { about: {} } }, ['about']), true);
  assert.equal(cachedContentMatchesScope({ scope: 'about', content: { about: {} } }, ['contact']), false);
});

test('unresolved public shell contains neutral status text, not marketing copy', () => {
  const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
  const unresolvedShell = app.slice(app.indexOf('if (!resolved)'), app.indexOf('return (\n    <>', app.indexOf('if (!resolved)')));
  assert.match(unresolvedShell, /Loading site content/);
  assert.doesNotMatch(unresolvedShell, /creative digital collective|Selected Projects|Need visuals/i);
});

test('public content scope changes cannot paint stale fallback copy', () => {
  const contentApi = readFileSync(resolve(root, 'src/lib/contentApi.js'), 'utf8');
  assert.match(contentApi, /contentScope === scope/);
  assert.match(contentApi, /resolved: Boolean\(cached\)/);
  assert.match(contentApi, /setContentScope\(scope\)/);
});

test('favicon and manifest references resolve to square static assets', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/site.webmanifest'), 'utf8'));
  const expected = [
    '/favicon.ico',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',
    ...manifest.icons.map((icon) => icon.src),
  ];
  expected.forEach((asset) => assert.equal(existsSync(resolve(root, `public${asset}`)), true, `${asset} must exist`));
  assert.doesNotMatch(html, /Vite App|React App|vite\.svg/i);
  assert.match(html, /https:\/\/www\.lahatliwa\.studio\//);
  assert.match(html, /social-card\.jpg/);
});

test('public destinations reject executable schemes and preserve valid links', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(safeExternalUrl('data:text/html,test'), '');
  assert.equal(safeExternalUrl('https://example.com/path?token=abc'), 'https://example.com/path?token=abc');
  assert.equal(safeInternalPath('/projects?branch=studio'), '/projects?branch=studio');
  assert.equal(safeInternalPath('//example.com'), '');
  assert.equal(socialLinkMeta({ label: 'Email', href: 'mailto:hello@example.com' }).href, 'mailto:hello@example.com');
});

test('public image priorities match the installed React runtime and loading placeholders remain steady', () => {
  const publicSources = [
    'src/components/CreativeHero.jsx',
    'src/components/ProjectCard.jsx',
    'src/pages/Home.jsx',
    'src/pages/ProjectDetails.jsx',
  ].map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  const loadingState = readFileSync(resolve(root, 'src/components/LoadingState.jsx'), 'utf8');
  assert.doesNotMatch(publicSources, /fetchPriority=/);
  assert.match(publicSources, /fetchpriority=/);
  assert.doesNotMatch(loadingState, /animate-pulse/);
});

test('dark native menus preserve readable choices and mobile admin actions stay distinct', () => {
  const styles = readFileSync(resolve(root, 'src/index.css'), 'utf8');
  const inquiry = readFileSync(resolve(root, 'src/pages/StartProject.jsx'), 'utf8');
  const adminLayout = readFileSync(resolve(root, 'src/components/admin/AdminLayout.jsx'), 'utf8');
  assert.match(styles, /\.dark-select option,[\s\S]*?background-color: #18181b;[\s\S]*?color: #f4f4f5;/);
  assert.match(styles, /\.admin-shell select option/);
  assert.match(inquiry, /Preferred creative[\s\S]*?className="dark-select/);
  assert.match(adminLayout, /View site<\/Link>[\s\S]*?Logout<\/button>/);
  assert.match(adminLayout, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
});
