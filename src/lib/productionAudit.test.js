import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('public shell renders immediately while content refresh stays non-blocking', () => {
  const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
  assert.doesNotMatch(app, /if \(!resolved\)/);
  assert.match(app, /Refreshing website content/);
});

test('public content scope changes cannot paint stale fallback copy', () => {
  const contentApi = readFileSync(resolve(root, 'src/lib/contentApi.js'), 'utf8');
  assert.match(contentApi, /contentScope === scope/);
  assert.match(contentApi, /const value = \{ content/);
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

test('unknown routes retain the public shell and provide accessible recovery links', () => {
  const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
  const notFound = readFileSync(resolve(root, 'src/pages/NotFound.jsx'), 'utf8');
  assert.match(app, /<Route path="\*" element=\{<NotFound \/>\} \/>/);
  assert.match(notFound, /<h1 id="not-found-heading"/);
  assert.match(notFound, /<Link to="\/"/);
  assert.match(notFound, /<Link to="\/projects"/);
});

test('stale lazy-route chunks recover once while genuine render failures keep a useful fallback', () => {
  const main = readFileSync(resolve(root, 'src/main.jsx'), 'utf8');
  const boundary = readFileSync(resolve(root, 'src/components/PublicErrorBoundary.jsx'), 'utf8');
  assert.match(main, /installReleaseRecovery\(\)/);
  assert.match(boundary, /recoverDynamicImportError\(error\)/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.doesNotMatch(boundary, /this\.setState\(\{ failed: false \}\)/);
});

test('production headers permit brand fonts and cache fingerprinted build assets', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const deployment = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
  const globalHeaders = deployment.headers.find(({ source }) => source === '/(.*)')?.headers ?? [];
  const contentSecurityPolicy = globalHeaders.find(({ key }) => key === 'Content-Security-Policy')?.value ?? '';
  const assetHeaders = deployment.headers.find(({ source }) => source === '/assets/(.*)')?.headers ?? [];
  const cacheControl = assetHeaders.find(({ key }) => key === 'Cache-Control')?.value ?? '';

  assert.match(contentSecurityPolicy, /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
  assert.match(contentSecurityPolicy, /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
  assert.match(contentSecurityPolicy, /object-src 'none'/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  const scriptPolicy = contentSecurityPolicy.split(';').find((directive) => directive.trim().startsWith('script-src')) ?? '';
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'/);
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  for (const source of inlineScripts) {
    const hash = createHash('sha256').update(source).digest('base64');
    assert.match(scriptPolicy, new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.equal(cacheControl, 'public, max-age=31536000, immutable');
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
  assert.match(loadingState, /\/official-logo\.webp/);
  assert.match(loadingState, /brand-loading-mark/);
  assert.match(loadingState, /role="status" aria-live="polite"/);
});

test('native menus follow the active theme and mobile admin actions stay distinct', () => {
  const styles = readFileSync(resolve(root, 'src/index.css'), 'utf8');
  const inquiry = readFileSync(resolve(root, 'src/pages/StartProject.jsx'), 'utf8');
  const adminLayout = readFileSync(resolve(root, 'src/components/admin/AdminLayout.jsx'), 'utf8');
  assert.match(styles, /\.dark-select,[\s\S]*?color-scheme: inherit;/);
  assert.match(styles, /\.dark-select option,[\s\S]*?background-color: var\(--theme-primary-surface\);[\s\S]*?color: var\(--theme-text-primary\);/);
  assert.match(styles, /\.admin-shell select option/);
  assert.match(inquiry, /RecipientStep/);
  assert.match(inquiry, /className="dark-select/);
  assert.match(adminLayout, /View site<\/Link>[\s\S]*?Logout<\/button>/);
  assert.match(adminLayout, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
});

test('shared interaction treatments expose persistent focus, active, and disclosure cues', () => {
  const styles = readFileSync(resolve(root, 'src/index.css'), 'utf8');
  const navbar = readFileSync(resolve(root, 'src/components/Navbar.jsx'), 'utf8');
  const adminLayout = readFileSync(resolve(root, 'src/components/admin/AdminLayout.jsx'), 'utf8');
  const inquiries = readFileSync(resolve(root, 'src/pages/admin/AdminInquiries.jsx'), 'utf8');
  const services = readFileSync(resolve(root, 'src/pages/Services.jsx'), 'utf8');
  assert.match(styles, /:where\(a\[href\], button, input, textarea, select, summary\):focus-visible/);
  assert.match(styles, /\.interactive-tab\[aria-selected="true"\]/);
  assert.match(navbar, /aria-expanded=\{open\}/);
  assert.match(navbar, /aria-controls="public-mobile-navigation"/);
  assert.match(adminLayout, /aria-controls="admin-mobile-navigation"/);
  assert.match(inquiries, /ChevronDown/);
  assert.match(inquiries, /group-open:rotate-180/);
  assert.match(services, /aria-label=\{`Choose \$\{service\.name\} for \$\{branch\.label\}`\}/);
});

test('editorial labels use meaningful language instead of decorative ordinal counters', () => {
  const sources = [
    'src/components/CreativeHero.jsx',
    'src/components/CreativeProfileView.jsx',
    'src/components/ProjectCard.jsx',
    'src/pages/About.jsx',
    'src/pages/Creatives.jsx',
    'src/pages/Privacy.jsx',
    'src/pages/Services.jsx',
    'src/pages/NotFound.jsx',
    'src/pages/admin/ContentEditor.jsx',
  ]
    .map((file) => readFileSync(resolve(root, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(sources, /\b0[1-9]\s*\/|padStart\(2,\s*['"]0['"]\)|404\s*\//);
  assert.doesNotMatch(sources, /projectCount|Published profiles|\$\{skills\.length\} capabilities/);
  assert.match(sources, /Service category/);
  assert.match(sources, /Untitled service group/);
  assert.match(sources, /Profile focus/);
});
