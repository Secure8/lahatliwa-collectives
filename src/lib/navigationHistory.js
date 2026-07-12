export function publicLocationState(location, anchorId = '') {
  return { from: { pathname: location.pathname, search: location.search, hash: location.hash, key: location.key }, anchorId, scrollY: typeof window === 'undefined' ? 0 : window.scrollY };
}
export function shouldPushFilter(currentValue, nextValue) { return String(currentValue || '') !== String(nextValue || ''); }
export function scrollPositionKey(location) { return `${location.key || 'default'}:${location.pathname}${location.search}${location.hash}`; }
export function detailBackAction(locationState, historyIndex, fallback) { return locationState?.from || Number(historyIndex) > 0 ? { delta: -1 } : { to: fallback }; }

export function navigationScrollPlan({ navigationType, previousLocation, location, savedPosition, currentPosition = 0 }) {
  if (location.hash) return { mode: 'anchor', target: location.hash.slice(1) };
  if (navigationType === 'POP') return { mode: 'restore', top: savedPosition ?? 0 };
  if (location.state?.preserveScroll) return { mode: 'preserve', top: location.state.scrollY ?? currentPosition };
  const samePath = previousLocation?.pathname === location.pathname;
  if (samePath && previousLocation?.search !== location.search) return { mode: 'preserve', top: currentPosition };
  return { mode: 'top', top: 0 };
}

export function scrollPreservingNavigationState(scrollContext, scrollY = 0) {
  return { preserveScroll: true, scrollContext, scrollY };
}

export function publicRouteBoundaryKey(location) { return location.pathname; }
