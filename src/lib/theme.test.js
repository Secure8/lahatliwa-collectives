import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyDocumentTheme, canAnimateTheme, normalizeThemePreference, persistThemePreference, readThemePreference, resolveThemePreference, systemTheme, THEME_STORAGE_KEY, themeAnimationOrigin, themeRevealRadius } from './theme.js';

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

test('saved Light, Dark, and System preferences persist through one shared key', () => {
  for (const preference of ['light', 'dark', 'system']) {
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

test('unsupported View Transitions and reduced motion switch immediately', () => {
  assert.equal(canAnimateTheme({}, () => ({ matches: false })), false);
  assert.equal(canAnimateTheme({ startViewTransition() {} }, () => ({ matches: true })), false);
  assert.equal(canAnimateTheme({ startViewTransition() {} }, () => ({ matches: false })), true);
});

test('provider, controls, startup, and rapid-change contracts stay shared across public and admin', async () => {
  const [provider, control, navbar, adminLayout, index, css] = await Promise.all([
    readFile(new URL('./ThemeProvider.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ThemeControl.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(provider, /matchMedia\?\.\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(provider, /addEventListener\?\.\('change', onSystemChange\)/);
  assert.match(provider, /document\.startViewTransition\(commit\)/);
  assert.match(provider, /request === requestRef\.current/);
  assert.match(provider, /::view-transition-new\(root\)/);
  assert.match(control, /aria-pressed=\{preference === value\}/);
  assert.match(control, /Light[\s\S]*Dark[\s\S]*System/);
  assert.match(navbar, /<ThemeControl/);
  assert.match(adminLayout, /<ThemeControl/);
  assert.match(index, /document\.documentElement\.dataset\.theme = resolved/);
  assert.doesNotMatch(index, /startViewTransition/);
  assert.match(css, /--theme-page-background/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /html\.theme-transition::view-transition-new\(root\)/);
});
