export const MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY = 24;
export const MOBILE_APP_BAR_SCROLL_JITTER_TOLERANCE = 4;
export const MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD = 36;
export const MOBILE_APP_BAR_SHOW_DISTANCE_THRESHOLD = 12;
export const MOBILE_APP_BAR_HIDE_TRANSITION_DURATION = 220;
export const MOBILE_APP_BAR_SHOW_TRANSITION_DURATION = 180;

export const PUBLIC_PRIMARY_DESTINATIONS = [
  ['Home', '/'],
  ['Services', '/services'],
  ['Projects', '/projects'],
  ['Creatives', '/creatives'],
  ['Inquiry', '/inquiry'],
];

export function publicAppBarMode(pathname = '/') {
  if (pathname === '/') return 'overlay';
  return 'surface';
}

export function createMobileAppBarScrollState({ visible = true, lastY = 0 } = {}) {
  return {
    visible,
    lastY: Math.max(0, Number(lastY) || 0),
    direction: 0,
    accumulatedDistance: 0,
  };
}

export function mobileAppBarVisibility({ state, nextY = 0, locked = false, topVisibleBoundary = MOBILE_APP_BAR_TOP_VISIBLE_BOUNDARY, jitterTolerance = MOBILE_APP_BAR_SCROLL_JITTER_TOLERANCE, hideDistanceThreshold = MOBILE_APP_BAR_HIDE_DISTANCE_THRESHOLD, showDistanceThreshold = MOBILE_APP_BAR_SHOW_DISTANCE_THRESHOLD } = {}) {
  const previous = state || createMobileAppBarScrollState();
  const y = Math.max(0, Number(nextY) || 0);

  if (locked || y <= topVisibleBoundary) return createMobileAppBarScrollState({ visible: true, lastY: y });

  const delta = y - previous.lastY;
  const distance = Math.abs(delta);
  if (distance < jitterTolerance) return { ...previous, lastY: y };

  const direction = delta > 0 ? 1 : -1;
  const accumulatedDistance = previous.direction === direction
    ? previous.accumulatedDistance + distance
    : distance;
  const threshold = direction > 0 ? hideDistanceThreshold : showDistanceThreshold;

  if (accumulatedDistance < threshold) {
    return { ...previous, lastY: y, direction, accumulatedDistance };
  }

  return {
    visible: direction < 0,
    lastY: y,
    direction,
    accumulatedDistance: 0,
  };
}

export function adminPageTitle(pathname = '', groups = []) {
  const matches = groups
    .flatMap(([, links = []]) => links)
    .filter(([, href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((left, right) => right[1].length - left[1].length);
  return matches[0]?.[0] || 'Dashboard';
}

export function publicDestinationIsActive(pathname = '/', href = '/') {
  if (href === '/') return pathname === '/';
  if (href === '/inquiry') return pathname === '/inquiry' || pathname === '/start-a-project' || pathname.startsWith('/inquiry/');
  return pathname === href || pathname.startsWith(`${href}/`);
}
