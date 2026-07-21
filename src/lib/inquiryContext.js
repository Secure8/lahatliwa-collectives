const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EDITORIAL_CONTEXT_TYPES = new Set(['journal', 'event', 'place', 'activity', 'local_product']);
const SERVICE_BRANCH_KEYS = new Set(['studio', 'tech', 'digital', 'social', 'general']);

export const INQUIRY_PATHS = Object.freeze({
  service: { key: 'service', label: 'Creative or Digital Service' },
  tourism: { key: 'tourism', label: 'Explore Aklan Inquiry' },
  general: { key: 'general', label: 'General Inquiry' },
});

export const TOURISM_INQUIRY_CATEGORIES = Object.freeze([
  ['destination-information', 'Destination information'],
  ['event-or-activity', 'Event or activity question'],
  ['local-product', 'Local product question'],
  ['tourism-question', 'Tourism question'],
  ['correction-or-concern', 'Correction or public concern'],
]);

export const INQUIRY_CONTEXT_TYPES = Object.freeze(['general', 'branch', 'service', 'creative', 'project', 'editorial', 'destination', 'event', 'activity', 'local_product', 'journal']);

export function defaultTourismInquiryCategory(type = '') {
  if (type === 'place' || type === 'destination') return 'destination-information';
  if (type === 'event' || type === 'activity') return 'event-or-activity';
  if (type === 'local_product') return 'local-product';
  return 'tourism-question';
}

export function normalizeInquiryContext(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = String(value.type || '').trim().toLowerCase();
  const slug = String(value.slug || '').trim().toLowerCase();
  const id = String(value.id || value.postId || '').trim();
  if (!SLUG_PATTERN.test(slug)) return null;
  if (id && !UUID_PATTERN.test(id)) return null;
  if (type === 'project') {
    if (!id) return null;
    const branch = SERVICE_BRANCH_KEYS.has(String(value.branch || '').trim().toLowerCase()) ? String(value.branch).trim().toLowerCase() : '';
    const service = SLUG_PATTERN.test(String(value.service || '').trim().toLowerCase()) ? String(value.service).trim().toLowerCase() : '';
    const creative = SLUG_PATTERN.test(String(value.creative || '').trim().toLowerCase()) ? String(value.creative).trim().toLowerCase() : '';
    return {
      type,
      id,
      slug,
      title: String(value.title || '').trim().slice(0, 180),
      publicUrl: `/projects/${encodeURIComponent(slug)}`,
      branch,
      service,
      creative,
      sourceAction: String(value.sourceAction || 'project-detail-inquiry').trim().slice(0, 80),
    };
  }
  if (!EDITORIAL_CONTEXT_TYPES.has(type)) return null;
  const category = TOURISM_INQUIRY_CATEGORIES.some(([key]) => key === value.inquiryCategory)
    ? value.inquiryCategory
    : defaultTourismInquiryCategory(type);
  return {
    type,
    slug,
    ...(id ? { id } : {}),
    title: String(value.title || '').trim().slice(0, 180),
    publicUrl: String(value.publicUrl || '').trim().slice(0, 500),
    municipality: String(value.municipality || '').trim().slice(0, 120),
    inquiryCategory: category,
    sourceAction: String(value.sourceAction || 'ask-about-story').trim().slice(0, 80),
  };
}

export function inquiryContextFromSearchParams(params) {
  const context = normalizeInquiryContext({
    id: params.get('contextId') || '',
    type: params.get('contextType') || '',
    slug: params.get('contextSlug') || '',
    title: params.get('contextTitle') || '',
    municipality: params.get('contextMunicipality') || '',
    inquiryCategory: params.get('inquiryCategory') || '',
    sourceAction: params.get('sourceAction') || '',
    publicUrl: params.get('contextUrl') || '',
    branch: params.get('branch') || '',
    service: params.get('service') || '',
    creative: params.get('creative') || '',
  });
  return context;
}

export function contextualInquiryUrl({ path = '', branch = '', service = '', creative = '', context = null } = {}) {
  const params = new URLSearchParams();
  if (INQUIRY_PATHS[path]) params.set('path', path);
  if (branch) params.set('branch', branch);
  if (service) params.set('service', service);
  if (creative) params.set('creative', creative);
  const normalized = normalizeInquiryContext(context);
  if (normalized) {
    params.set('path', normalized.type === 'project' ? 'service' : 'tourism');
    if (normalized.type === 'project') {
      if (!params.has('branch') && normalized.branch) params.set('branch', normalized.branch);
      if (!params.has('service') && normalized.service) params.set('service', normalized.service);
      if (!params.has('creative') && normalized.creative) params.set('creative', normalized.creative);
    }
    if (normalized.id) params.set('contextId', normalized.id);
    params.set('contextType', normalized.type);
    params.set('contextSlug', normalized.slug);
    if (normalized.title) params.set('contextTitle', normalized.title);
    if (normalized.municipality) params.set('contextMunicipality', normalized.municipality);
    if (normalized.publicUrl) params.set('contextUrl', normalized.publicUrl);
    if (normalized.inquiryCategory) params.set('inquiryCategory', normalized.inquiryCategory);
    params.set('sourceAction', normalized.sourceAction);
  }
  const query = params.toString();
  return `/inquiry${query ? `?${query}` : ''}`;
}
