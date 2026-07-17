export const MOBILE_APP_BAR_SCROLL_THRESHOLD = 12;
export const MOBILE_APP_BAR_REVEAL_THRESHOLD = 3;
export const MOBILE_APP_BAR_TOP_OFFSET = 24;

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

export function mobileAppBarVisibility({ currentVisible = true, lastY = 0, nextY = 0, locked = false, threshold = MOBILE_APP_BAR_SCROLL_THRESHOLD, revealThreshold = MOBILE_APP_BAR_REVEAL_THRESHOLD, topOffset = MOBILE_APP_BAR_TOP_OFFSET } = {}) {
  const y = Math.max(0, Number(nextY) || 0);
  const previousY = Math.max(0, Number(lastY) || 0);

  if (locked || y <= topOffset) return { visible: true, lastY: y };

  const delta = y - previousY;
  const directionThreshold = delta < 0 ? revealThreshold : threshold;
  if (Math.abs(delta) < directionThreshold) return { visible: currentVisible, lastY: previousY };
  return { visible: delta < 0, lastY: y };
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
