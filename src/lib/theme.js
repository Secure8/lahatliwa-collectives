export const THEME_STORAGE_KEY = 'lahat-liwa-theme';
export const THEME_PREFERENCES = Object.freeze(['light', 'dark', 'system']);
export const THEME_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system';
}

export function nextThemePreference(resolvedTheme) {
  return resolvedTheme === 'light' ? 'dark' : 'light';
}

export function systemTheme(matchMedia = globalThis.matchMedia) {
  try {
    return matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

export function resolveThemePreference(preference, matchMedia = globalThis.matchMedia) {
  const normalized = normalizeThemePreference(preference);
  return normalized === 'system' ? systemTheme(matchMedia) : normalized;
}

export function readThemePreference(storage = globalThis.localStorage) {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function persistThemePreference(preference, storage = globalThis.localStorage) {
  const normalized = normalizeThemePreference(preference);
  try {
    storage?.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
  }
  return normalized;
}

export function applyDocumentTheme(theme, documentRef = globalThis.document) {
  const resolved = theme === 'light' ? 'light' : 'dark';
  const root = documentRef?.documentElement;
  if (!root) return resolved;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const themeMeta = documentRef.querySelector?.('meta[name="theme-color"]');
  themeMeta?.setAttribute('content', resolved === 'light' ? '#f5f1e8' : '#09090b');
  return resolved;
}

export function themeMotionAllowed(matchMedia = globalThis.matchMedia) {
  try {
    return !matchMedia?.(THEME_REDUCED_MOTION_QUERY)?.matches;
  } catch {
    return false;
  }
}
