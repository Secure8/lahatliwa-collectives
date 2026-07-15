const KNOWN_HOME_CTA_PATHS = new Map([
  ['contact us', '/contact'],
  ['explore published work', '/projects'],
  ['send an inquiry', '/inquiry'],
  ['send inquiry', '/inquiry'],
  ['view projects', '/projects'],
]);

export function homeCtaPath(label, fallbackPath) {
  const normalizedLabel = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return KNOWN_HOME_CTA_PATHS.get(normalizedLabel) || fallbackPath;
}
