const normalizeKey = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

export const SERVICE_CATALOG = Object.freeze({
  studio: Object.freeze([
    { key: 'photo', name: 'Photo' },
    { key: 'video', name: 'Video' },
    { key: 'same-day-edit', name: 'Same-Day Edit (SDE)' },
    { key: 'highlights', name: 'Highlights' },
    { key: 'editing', name: 'Editing' },
    { key: 'other-creative-work', name: 'Other Creative Work' },
  ]),
  tech: Object.freeze([
    { key: 'consultation', name: 'Consultation' },
    { key: 'diagnostics', name: 'Diagnostics' },
    { key: 'remote-assistance', name: 'Remote Assistance' },
    { key: 'setup', name: 'Setup' },
    { key: 'on-site-support', name: 'On-site Support' },
    { key: 'other-technical-help', name: 'Other Technical Help' },
  ]),
  digital: Object.freeze([
    { key: 'website', name: 'Website' },
    { key: 'app', name: 'App' },
    { key: 'system', name: 'System' },
    { key: 'design-and-prototype', name: 'Design & Prototype' },
    { key: 'digital-product', name: 'Digital Product' },
    { key: 'consultation', name: 'Consultation' },
    { key: 'other-digital-work', name: 'Other Digital Work' },
  ]),
  social: Object.freeze([
    { key: 'management', name: 'Management' },
    { key: 'content', name: 'Content' },
    { key: 'campaign', name: 'Campaign' },
    { key: 'strategy', name: 'Strategy' },
    { key: 'page-setup', name: 'Page Setup' },
    { key: 'review-and-consultation', name: 'Review & Consultation' },
    { key: 'other-social-media-work', name: 'Other Social Media Work' },
  ]),
  general: Object.freeze([
    { key: 'general-inquiry', name: 'General Inquiry' },
    { key: 'multidisciplinary-project', name: 'Multidisciplinary Project' },
    { key: 'partnership-or-collaboration', name: 'Partnership or Collaboration' },
    { key: 'not-sure-yet', name: 'Not Sure Yet' },
  ]),
});

const SERVICE_ALIASES = Object.freeze({
  studio: {
    photography: 'photo', 'product-photography': 'photo', 'portrait-photography': 'photo', 'photo-shoot': 'photo',
    videography: 'video', 'video-shoot-editing': 'video', 'video-shoot': 'video', 'promotional-videography': 'video',
    sde: 'same-day-edit', 'same-day-edit-sde': 'same-day-edit',
    'event-highlights': 'highlights', 'highlight-video': 'highlights',
    'photo-editing': 'editing', 'video-editing': 'editing', 'photo-retouching': 'editing',
    'other-creative': 'other-creative-work',
  },
  tech: {
    'technical-consultation': 'consultation', 'computer-support': 'diagnostics', troubleshooting: 'diagnostics',
    'virtual-assistance': 'remote-assistance', 'remote-support': 'remote-assistance', 'software-system-assistance': 'remote-assistance',
    'device-setup': 'setup', 'software-installation': 'setup', configuration: 'setup',
    'onsite-support': 'on-site-support', 'home-visit': 'on-site-support',
    'it-technician-services': 'other-technical-help', 'technical-assistance': 'other-technical-help', 'other-technical': 'other-technical-help',
  },
  digital: {
    'website-development': 'website', 'portfolio-websites': 'website', 'business-websites': 'website', 'landing-pages': 'website', 'landing-page-development': 'website',
    'app-development': 'app', 'application-development': 'app',
    'digital-systems': 'system', 'cms-systems': 'system', 'system-development': 'system',
    'ui-and-prototype': 'design-and-prototype', 'ui-prototype': 'design-and-prototype', 'design-prototype': 'design-and-prototype', prototype: 'design-and-prototype',
    'digital-products': 'digital-product', 'digital-consultation': 'consultation',
    'other-digital': 'other-digital-work',
  },
  social: {
    'social-media-management': 'management', 'page-management': 'management', 'account-management': 'management',
    'content-planning': 'content', 'social-media-content': 'content', 'promotional-content': 'content',
    'digital-marketing': 'campaign', 'digital-marketing-support': 'campaign', campaigns: 'campaign', 'creative-campaigns': 'campaign',
    'content-strategy': 'strategy', 'social-strategy': 'strategy', 'page-rebuilding': 'page-setup',
    'review-consultation': 'review-and-consultation', 'social-media-consultation': 'review-and-consultation',
    'other-social': 'other-social-media-work',
  },
  general: {
    general: 'general-inquiry', multidisciplinary: 'multidisciplinary-project', partnership: 'partnership-or-collaboration', collaboration: 'partnership-or-collaboration', unsure: 'not-sure-yet',
  },
});

export function serviceKey(value = '') {
  return normalizeKey(value);
}

export function canonicalServiceKey(branch, value = '') {
  const key = normalizeKey(value);
  return SERVICE_ALIASES[branch]?.[key] || key;
}

export function serviceCategoriesForBranch(branch, configuredServices = []) {
  const canonical = SERVICE_CATALOG[branch] || [];
  const used = new Set(canonical.map((item) => item.key));
  const custom = [];
  for (const value of Array.isArray(configuredServices) ? configuredServices : []) {
    const name = String(value || '').trim();
    const rawKey = normalizeKey(name);
    if (!name || !rawKey) continue;
    const key = canonicalServiceKey(branch, rawKey);
    if (used.has(key)) continue;
    used.add(key);
    custom.push({ key, name, custom: true });
  }
  return [...canonical, ...custom];
}

export function resolveServiceCategory(branch, value, configuredServices = []) {
  const key = canonicalServiceKey(branch, value);
  return serviceCategoriesForBranch(branch, configuredServices).find((item) => item.key === key) || null;
}
