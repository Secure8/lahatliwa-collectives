import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyDocumentTheme, canAnimateTheme, nextThemePreference, normalizeThemePreference, persistThemePreference, readThemePreference, resolveThemePreference, systemTheme, THEME_ANIMATION_SKIP_QUERY, THEME_STORAGE_KEY, themeAnimationOrigin, themeRevealRadius } from './theme.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key),
  };
}

test('theme preference defaults to System and rejects invalid saved values', () => {
  assert.equal(normalizeThemePreference(undefined), 'system');
  assert.equal(normalizeThemePreference('unexpected'), 'system');
  assert.equal(readThemePreference(memoryStorage()), 'system');
  assert.equal(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'invalid' })), 'system');
});

test('saved Light and Dark preferences persist through one shared key', () => {
  for (const preference of ['light', 'dark']) {
    const storage = memoryStorage();
    persistThemePreference(preference, storage);
    assert.equal(storage.value(THEME_STORAGE_KEY), preference);
    assert.equal(readThemePreference(storage), preference);
  }
});

test('System resolves from the operating-system media preference', () => {
  assert.equal(systemTheme(() => ({ matches: true })), 'dark');
  assert.equal(systemTheme(() => ({ matches: false })), 'light');
  assert.equal(resolveThemePreference('system', () => ({ matches: true })), 'dark');
  assert.equal(resolveThemePreference('light', () => ({ matches: true })), 'light');
});

test('one-click toggles always produce an explicit opposite preference', () => {
  assert.equal(nextThemePreference('dark'), 'light');
  assert.equal(nextThemePreference('light'), 'dark');
  const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'system' });
  const resolved = resolveThemePreference(readThemePreference(storage), () => ({ matches: true }));
  persistThemePreference(nextThemePreference(resolved), storage);
  assert.equal(storage.value(THEME_STORAGE_KEY), 'light');
});

test('resolved themes update the root attribute, native color scheme, and browser color', () => {
  let metaColor = '';
  const documentRef = {
    documentElement: { dataset: {}, style: {} },
    querySelector: () => ({ setAttribute: (_name, value) => { metaColor = value; } }),
  };
  assert.equal(applyDocumentTheme('light', documentRef), 'light');
  assert.equal(documentRef.documentElement.dataset.theme, 'light');
  assert.equal(documentRef.documentElement.style.colorScheme, 'light');
  assert.equal(metaColor, '#f5f1e8');
  applyDocumentTheme('dark', documentRef);
  assert.equal(documentRef.documentElement.dataset.theme, 'dark');
  assert.equal(metaColor, '#09090b');
});

test('animation origin uses click coordinates, element bounds, then viewport center safely', () => {
  assert.deepEqual(themeAnimationOrigin({ clientX: 42, clientY: 84 }), { x: 42, y: 84 });
  assert.deepEqual(themeAnimationOrigin({ clientX: 0, clientY: 0 }, { getBoundingClientRect: () => ({ left: 10, top: 20, width: 40, height: 20 }) }), { x: 30, y: 30 });
  assert.deepEqual(themeAnimationOrigin(null, null, { innerWidth: 800, innerHeight: 600 }), { x: 400, y: 300 });
  assert.equal(themeRevealRadius({ x: 0, y: 0 }, { innerWidth: 300, innerHeight: 400 }), 500);
});

test('unsupported and constrained Chrome View Transitions switch immediately', () => {
  assert.equal(canAnimateTheme({}, () => ({ matches: false })), false);
  assert.equal(canAnimateTheme({ startViewTransition() {} }, () => ({ matches: true })), false);
  assert.equal(canAnimateTheme({ startViewTransition() {} }, () => ({ matches: false })), true);
  assert.match(THEME_ANIMATION_SKIP_QUERY, /prefers-reduced-motion: reduce/);
  assert.match(THEME_ANIMATION_SKIP_QUERY, /max-width: 1023px/);
  assert.match(THEME_ANIMATION_SKIP_QUERY, /pointer: coarse/);
  assert.match(THEME_ANIMATION_SKIP_QUERY, /display-mode: standalone/);
});

test('provider, one global toggle, startup, and rapid-change contracts stay shared across public and admin', async () => {
  const [provider, toggle, app, navbar, adminLayout, login, forgotPassword, setPassword, protectedRoute, index, css, home, contentApi] = await Promise.all([
    readFile(new URL('./ThemeProvider.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ThemeToggle.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/ForgotPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/SetPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ProtectedRoute.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./contentApi.js', import.meta.url), 'utf8'),
  ]);
  assert.match(provider, /matchMedia\?\.\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(provider, /addEventListener\?\.\('change', onSystemChange\)/);
  assert.match(provider, /document\.startViewTransition\(commit\)/);
  assert.match(provider, /request === requestRef\.current/);
  assert.match(provider, /::view-transition-new\(root\)/);
  assert.match(toggle, /type="button"/);
  assert.match(toggle, /nextTheme === 'light' \? 'Switch to Light Mode' : 'Switch to Dark Mode'/);
  assert.match(toggle, /nextTheme === 'light' \? Sun : Moon/);
  assert.match(toggle, /setPreference\(nextTheme, \{ event, element: event\.currentTarget \}\)/);
  assert.match(toggle, /adminWorkspaceHasIntegratedToggle/);
  assert.match(toggle, /if \(adminWorkspaceHasIntegratedToggle\) return null/);
  assert.match(toggle, /window\.addEventListener\('scroll', controller\.onScroll, \{ passive: true \}\)/);
  assert.match(toggle, /window\.removeEventListener\('scroll', controller\.onScroll\)/);
  assert.match(toggle, /ref=\{buttonRef\}/);
  assert.match(toggle, /onFocus=\{\(event\) => controllerRef\.current\?\.onFocus\(event\.currentTarget\.matches\(':focus-visible'\)\)\}/);
  assert.match(toggle, /controllerRef\.current\?\.onThemeChange\(\{ focusVisible \}\)/);
  assert.equal((toggle.match(/window\.addEventListener\('scroll'/g) || []).length, 1);
  assert.equal((toggle.match(/window\.removeEventListener\('scroll'/g) || []).length, 1);
  assert.equal((toggle.match(/<button/g) || []).length, 1);
  assert.equal((app.match(/<ThemeToggle/g) || []).length, 1);
  for (const oldPlacement of [navbar, adminLayout, login, forgotPassword, setPassword, protectedRoute]) {
    assert.doesNotMatch(oldPlacement, /ThemeToggle|ThemeControl/);
  }
  assert.match(index, /document\.documentElement\.dataset\.theme = resolved/);
  assert.doesNotMatch(index, /startViewTransition/);
  assert.match(css, /--theme-page-background/);
  assert.match(home, /backgroundColor: content\.accentColor/);
  assert.match(contentApi, /'--site-brand-accent': content\.accentColor \|\| defaultSiteContent\.accentColor/);
  assert.match(css, /\[data-theme="light"\] \.theme-content-root[\s\S]*?--site-accent: var\(--site-brand-accent, #f6d58b\)/);
  assert.match(css, /--site-accent-text: color-mix\(in srgb, var\(--site-brand-accent, #f6d58b\) 72%, black\)/);
  assert.match(css, /:root \{[\s\S]*?--site-accent-hover: #ffe5a8;[\s\S]*?--site-accent-text: #f6d58b;/);
  assert.match(css, /\.theme-toggle[\s\S]*?position: fixed;[\s\S]*?left: max\(0\.75rem, env\(safe-area-inset-left\)\);[\s\S]*?bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.theme-toggle--scroll-hidden[\s\S]*?pointer-events: none;[\s\S]*?opacity: 0;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /html\.theme-transition::view-transition-new\(root\)/);
});
