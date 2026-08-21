import { Compass, Handshake, House, UsersRound } from 'lucide-react';

export const PUBLIC_NAVIGATION_ICON_OPTIONS = [
  ['home', 'Home', House],
  ['discover', 'Discover', Compass],
  ['creatives', 'Creatives', UsersRound],
  ['collab', 'Collab', Handshake],
];

const iconByKey = Object.fromEntries(PUBLIC_NAVIGATION_ICON_OPTIONS.map(([key, , Icon]) => [key, Icon]));

export function publicNavigationIcon(key, fallback = 'home') {
  return iconByKey[String(key || '').toLowerCase()] || iconByKey[fallback] || House;
}

export function publicNavigationItems(navigation = {}) {
  return [
    [navigation.homeLabel || 'Feed', '/', publicNavigationIcon(navigation.homeIcon, 'home')],
    [navigation.discoverLabel || 'Discover', '/discover', publicNavigationIcon(navigation.discoverIcon, 'discover')],
    [navigation.creativesLabel || 'Creatives', '/creatives', publicNavigationIcon(navigation.creativesIcon, 'creatives')],
    [navigation.inquiryLabel || 'Collab', '/inquiry', publicNavigationIcon(navigation.inquiryIcon, 'collab')],
  ];
}
