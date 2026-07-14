export const THEME_STORAGE_KEY = 'lahat-liwa-theme';
export const THEME_PREFERENCES = Object.freeze(['light', 'dark', 'system']);

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system';
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

export function themeAnimationOrigin(event, element, viewport = globalThis.window) {
  const clickedX = Number(event?.clientX);
  const clickedY = Number(event?.clientY);
  if (Number.isFinite(clickedX) && Number.isFinite(clickedY) && (clickedX !== 0 || clickedY !== 0)) {
    return { x: clickedX, y: clickedY };
  }
  try {
    const bounds = element?.getBoundingClientRect?.();
    if (bounds) return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  } catch {
  }
  return { x: Number(viewport?.innerWidth || 0) / 2, y: Number(viewport?.innerHeight || 0) / 2 };
}

export function themeRevealRadius({ x, y }, viewport = globalThis.window) {
  const width = Number(viewport?.innerWidth || 0);
  const height = Number(viewport?.innerHeight || 0);
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}

export function canAnimateTheme(documentRef = globalThis.document, matchMedia = globalThis.matchMedia) {
  if (typeof documentRef?.startViewTransition !== 'function') return false;
  try {
    return !matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}
