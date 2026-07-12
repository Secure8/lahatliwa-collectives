export function publicLocationState(location, anchorId = '') {
  return { from: { pathname: location.pathname, search: location.search, hash: location.hash, key: location.key }, anchorId, scrollY: typeof window === 'undefined' ? 0 : window.scrollY };
}
export function shouldPushFilter(currentValue, nextValue) { return String(currentValue || '') !== String(nextValue || ''); }
export function scrollPositionKey(location) { return `${location.key || 'default'}:${location.pathname}${location.search}${location.hash}`; }
export function detailBackAction(locationState, historyIndex, fallback) { return locationState?.from || Number(historyIndex) > 0 ? { delta: -1 } : { to: fallback }; }
