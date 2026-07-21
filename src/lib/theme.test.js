import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyDocumentTheme, nextThemePreference, normalizeThemePreference, persistThemePreference, readThemePreference, resolveThemePreference, systemTheme, themeMotionAllowed, THEME_REDUCED_MOTION_QUERY, THEME_STORAGE_KEY } from './theme.js';

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

test('theme motion stays available on every viewport except reduced-motion environments', () => {
  assert.equal(themeMotionAllowed(() => ({ matches: false })), true);
  assert.equal(themeMotionAllowed(() => ({ matches: true })), false);
  assert.equal(THEME_REDUCED_MOTION_QUERY, '(prefers-reduced-motion: reduce)');
});

test('Editorial Studio uses the shared light and dark surface tokens', async () => {
  const studio = await readFile(new URL('../pages/editorial/EditorialStudio.jsx', import.meta.url), 'utf8');
  assert.match(studio, /editorial-studio-shell/);
  assert.match(studio, /<AppearanceMenuAction iconOnly className=/);
  assert.doesNotMatch(studio, /<AppearanceMenuAction iconOnly instant/);
  assert.match(studio, /bg-\[var\(--theme-page-background\)\]/);
  assert.match(studio, /bg-\[var\(--theme-navigation-surface\)\]/);
  assert.match(studio, /bg-\[var\(--theme-primary-surface\)\]/);
  assert.match(studio, /bg-\[var\(--theme-input-background\)\]/);
  assert.doesNotMatch(studio, /bg-\[#(?:090908|0c0c0b|0d0d0b|0b0b0a|10100e|11110f|151512|171714|181815|1c1c18)/i);
});

test('provider, one global toggle, startup, and rapid-change contracts stay shared across public and admin', async () => {
  const [provider, toggle, appearance, modeIcon, app, navbar, adminLayout, login, forgotPassword, setPassword, protectedRoute, index, main, css, home, collectiveHero, contentApi] = await Promise.all([
    readFile(new URL('./ThemeProvider.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ThemeToggle.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/AppearanceMenuAction.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ThemeModeIcon.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/ForgotPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/SetPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ProtectedRoute.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/CollectiveHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./contentApi.js', import.meta.url), 'utf8'),
  ]);
  assert.match(provider, /matchMedia\?\.\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(provider, /addEventListener\?\.\('change', onSystemChange\)/);
  assert.doesNotMatch(provider, /startViewTransition|clipPath|themeRevealRadius|pseudoElement/);
  assert.match(provider, /createThemeTransitionController/);
  assert.match(provider, /\{ transition = true \} = \{\}/);
  assert.match(provider, /transitionControllerRef\.current\?\.begin\(\)/);
  assert.match(provider, /controller\.dispose\(\)/);
  assert.doesNotMatch(provider, /\.animate\?|contentAnimationRef|opacity: 0\.82/);
  assert.match(toggle, /<ThemeModeIcon mode=\{nextTheme\}/);
  assert.match(appearance, /<ThemeModeIcon mode=\{nextTheme\}/);
  assert.match(modeIcon, /<Sun[\s\S]*?<Moon/);
  assert.match(modeIcon, /aria-hidden="true"/);
  assert.match(appearance, /const focusVisible = element\.matches\(':focus-visible'\)/);
  assert.match(appearance, /if \(!focusVisible\) element\.blur\(\)/);
  assert.match(navbar, /AppearanceMenuAction/);
  assert.match(css, /:where\(:root\.theme-transition\)[\s\S]*?transition-property: background-color, color, border-color, fill, stroke, box-shadow;[\s\S]*?transition-duration: 200ms;[\s\S]*?cubic-bezier\(0\.2, 0, 0, 1\)/);
  assert.match(css, /\.theme-mode-icon__layer[\s\S]*?opacity 180ms cubic-bezier\(0\.2, 0, 0, 1\)[\s\S]*?transform 180ms cubic-bezier\(0\.2, 0, 0, 1\)/);
  assert.match(css, /rotate\(-12deg\) scale\(0\.9\)/);
  assert.doesNotMatch(css, /theme-switch-icon-in|transition:\s*all/);
  assert.match(toggle, /type="button"/);
  assert.match(toggle, /nextTheme === 'light' \? 'Switch to light mode' : 'Switch to dark mode'/);
  assert.match(toggle, /const focusVisible = element\.matches\(':focus-visible'\)/);
  assert.match(toggle, /if \(!focusVisible\) element\.blur\(\)/);
  assert.match(toggle, /adminWorkspaceHasIntegratedToggle/);
  assert.match(toggle, /if \(adminWorkspaceHasIntegratedToggle \|\| editorialWorkspaceHasIntegratedToggle\) return null/);
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
  assert.match(index, /localStorage\.getItem\(key\)/);
  assert.match(index, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.doesNotMatch(index, /theme-transition/);
  assert.match(main, /ReactDOM\.createRoot/);
  assert.doesNotMatch(main, /hydrateRoot/);
  assert.doesNotMatch(index, /startViewTransition/);
  assert.match(css, /--theme-page-background/);
  assert.match(collectiveHero, /backgroundColor: content\.accentColor/);
  assert.match(contentApi, /'--site-brand-accent': content\.accentColor \|\| defaultSiteContent\.accentColor/);
  assert.match(css, /\[data-theme="light"\] \.theme-content-root[\s\S]*?--site-accent: var\(--site-brand-accent, #f6d58b\)/);
  assert.match(css, /--site-accent-text: color-mix\(in srgb, var\(--site-brand-accent, #f6d58b\) 72%, black\)/);
  assert.match(css, /:root \{[\s\S]*?--site-accent-hover: #ffe5a8;[\s\S]*?--site-accent-text: #f6d58b;/);
  assert.match(css, /\.theme-toggle[\s\S]*?position: fixed;[\s\S]*?left: max\(0\.75rem, env\(safe-area-inset-left\)\);[\s\S]*?bottom: calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.theme-toggle--scroll-hidden[\s\S]*?pointer-events: none;[\s\S]*?opacity: 0;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:where\(:root\.theme-transition\)[\s\S]*?\.theme-mode-icon__layer[\s\S]*?transition-duration: 0ms !important;/);
  assert.doesNotMatch(css, /::view-transition-(old|new)\(root\)/);
});
