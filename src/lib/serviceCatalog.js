const normalizeKey = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

export const SERVICE_CATALOG = Object.freeze({
  studio: Object.freeze([
    { key: 'photo', name: 'Photography' },
    { key: 'video', name: 'Videography' },
    { key: 'same-day-edit', name: 'Same-Day Edit (SDE)' },
    { key: 'highlights', name: 'Highlights' },
    { key: 'editing', name: 'Photo & Video Editing' },
    { key: 'other-creative-work', name: 'Other Visual Work' },
  ]),
  tech: Object.freeze([
    { key: 'destination-information', name: 'Destination Information' },
    { key: 'event-or-activity', name: 'Event or Activity Question' },
    { key: 'local-product', name: 'Local Product Question' },
    { key: 'tourism-question', name: 'Tourism Question' },
    { key: 'correction-or-concern', name: 'Correction or Public Concern' },
    { key: 'visitor-routing', name: 'Visitor Support and Routing' },
  ]),
  digital: Object.freeze([
    { key: 'website', name: 'Website Development' },
    { key: 'app', name: 'Application Development' },
    { key: 'design-and-prototype', name: 'UI & Prototyping' },
    { key: 'system', name: 'Digital Systems' },
    { key: 'maintenance-and-improvements', name: 'Maintenance & Improvements' },
    { key: 'consultation', name: 'Technical Consultation' },
  ]),
  social: Object.freeze([
    { key: 'management', name: 'Social Media Management' },
    { key: 'content', name: 'Content Planning' },
    { key: 'digital-marketing', name: 'Digital Marketing' },
    { key: 'campaign', name: 'Campaign Support' },
    { key: 'page-setup', name: 'Branding & Page Support' },
    { key: 'review-and-consultation', name: 'Marketing Consultation' },
  ]),
  general: Object.freeze([
    { key: 'general-inquiry', name: 'General Service Request' },
    { key: 'multidisciplinary-project', name: 'Multi-Branch Request' },
    { key: 'partnership-or-collaboration', name: 'Partnership & Collaboration' },
    { key: 'event-or-organization-support', name: 'Event or Organization Support' },
    { key: 'consultation-and-planning', name: 'Consultation & Planning' },
    { key: 'not-sure-yet', name: 'Not Sure Yet' },
  ]),
});

const SERVICE_ALIASES = Object.freeze({
  studio: {
    photography: 'photo', 'product-photography': 'photo', 'portrait-photography': 'photo', 'photo-shoot': 'photo',
    videography: 'video', 'video-shoot-editing': 'video', 'video-shoot': 'video', 'promotional-videography': 'video',
    sde: 'same-day-edit', 'same-day-edit-sde': 'same-day-edit',
    'event-highlights': 'highlights', 'highlight-video': 'highlights',
    'photo-editing': 'editing', 'video-editing': 'editing', 'photo-retouching': 'editing', 'photo-and-video-editing': 'editing',
    'other-creative': 'other-creative-work', 'other-visual-work': 'other-creative-work',
  },
  tech: {
    destination: 'destination-information', place: 'destination-information', event: 'event-or-activity', activity: 'event-or-activity', product: 'local-product', correction: 'correction-or-concern', general: 'tourism-question',
    'event-or-activity-question': 'event-or-activity', 'local-product-question': 'local-product', 'correction-or-public-concern': 'correction-or-concern', 'visitor-support-and-routing': 'visitor-routing',
    diagnostics: 'visitor-routing', setup: 'visitor-routing', 'remote-assistance': 'visitor-routing', 'on-site-support': 'visitor-routing', 'maintenance-and-optimization': 'visitor-routing',
    'technical-consultation': 'visitor-routing', consultation: 'visitor-routing', 'computer-support': 'visitor-routing', 'computer-troubleshooting': 'visitor-routing', troubleshooting: 'visitor-routing',
    'virtual-assistance': 'visitor-routing', 'remote-support': 'visitor-routing', 'software-system-assistance': 'visitor-routing',
    'device-setup': 'visitor-routing', 'software-installation': 'visitor-routing', 'software-assistance': 'visitor-routing',
    'system-network-support': 'visitor-routing', 'system-and-network-support': 'visitor-routing', 'onsite-support': 'visitor-routing', 'home-visit': 'visitor-routing',
    configuration: 'visitor-routing', maintenance: 'visitor-routing', optimization: 'visitor-routing',
    'other-technical-help': 'visitor-routing', 'it-technician-services': 'visitor-routing', 'technical-assistance': 'visitor-routing', 'other-technical': 'visitor-routing',
  },
  digital: {
    'website-development': 'website', 'portfolio-websites': 'website', 'business-websites': 'website', 'landing-pages': 'website', 'landing-page-development': 'website',
    'app-development': 'app', 'application-development': 'app',
    'digital-systems': 'system', 'cms-systems': 'system', 'system-development': 'system',
    'ui-and-prototype': 'design-and-prototype', 'ui-and-prototyping': 'design-and-prototype', 'ui-prototype': 'design-and-prototype', 'design-prototype': 'design-and-prototype', prototype: 'design-and-prototype',
    'digital-products': 'maintenance-and-improvements', 'digital-product': 'maintenance-and-improvements', maintenance: 'maintenance-and-improvements', improvements: 'maintenance-and-improvements',
    'digital-consultation': 'consultation', 'technical-consultation': 'consultation', 'other-digital': 'consultation', 'other-digital-work': 'consultation',
  },
  social: {
    'social-media-management': 'management', 'page-management': 'management', 'account-management': 'management',
    'content-planning': 'content', 'social-media-content': 'content', 'promotional-content': 'content',
    'digital-marketing-support': 'digital-marketing', strategy: 'digital-marketing', 'content-strategy': 'digital-marketing', 'social-strategy': 'digital-marketing',
    campaigns: 'campaign', 'campaign-support': 'campaign', 'creative-campaigns': 'campaign',
    'branding-and-page-support': 'page-setup', 'page-rebuilding': 'page-setup',
    'marketing-consultation': 'review-and-consultation', 'review-consultation': 'review-and-consultation', 'social-media-consultation': 'review-and-consultation',
    'other-social': 'review-and-consultation', 'other-social-media-work': 'review-and-consultation',
  },
  general: {
    general: 'general-inquiry', 'general-service-request': 'general-inquiry', multidisciplinary: 'multidisciplinary-project', 'multi-branch-request': 'multidisciplinary-project', partnership: 'partnership-or-collaboration', collaboration: 'partnership-or-collaboration', 'partnership-and-collaboration': 'partnership-or-collaboration',
    'event-support': 'event-or-organization-support', 'organization-support': 'event-or-organization-support', consultation: 'consultation-and-planning', planning: 'consultation-and-planning', unsure: 'not-sure-yet',
  },
});

export function serviceKey(value = '') {
  return normalizeKey(value);
}

export function canonicalServiceKey(branch, value = '') {
  const key = normalizeKey(value);
  return SERVICE_ALIASES[branch]?.[key] || key;
}

export function serviceCategoriesForBranch(branch, _configuredServices = []) {
  return SERVICE_CATALOG[branch] || [];
}

export function resolveServiceCategory(branch, value, configuredServices = []) {
  const key = canonicalServiceKey(branch, value);
  return serviceCategoriesForBranch(branch, configuredServices).find((item) => item.key === key) || null;
}
