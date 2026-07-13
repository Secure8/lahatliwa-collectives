export const SERVICE_BRANCHES = [
  { key: 'studio', label: 'Liwa Studio', action: 'Book a Creative', description: 'Photography, video, editing, coverage, and visual production.' },
  { key: 'tech', label: 'Liwa Tech', action: 'Get Technical Help', description: 'Diagnostics, setup, troubleshooting, and practical technical support.' },
  { key: 'digital', label: 'Liwa Digital', action: 'Start a Digital Project', description: 'Websites, applications, prototypes, products, and internal systems.' },
  { key: 'social', label: 'Liwa Social', action: 'Plan Your Campaign', description: 'Content planning, campaigns, account support, and social media management.' },
];

export const GENERAL_BRANCH = { key: 'general', label: 'General inquiry', action: 'Send an Inquiry', description: 'Multidisciplinary work, partnerships, collaborations, or questions for the collective.' };
export const INQUIRY_STEPS = ['Service', 'Creative or Team', 'Project Details', 'Schedule and Contact', 'Review'];
export const INQUIRY_DRAFT_KEY = 'lahat-liwa-inquiry-draft-v1';
export const REFERENCE_PATTERN = /^LLC-\d{4}-[A-Z0-9]{6}$/;

export function slugifyService(value = '') {
  return String(value).trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function branchKeyFromRecord(record = {}) {
  const source = `${record.slug || ''} ${record.name || ''}`.toLowerCase();
  if (source.includes('studio')) return 'studio';
  if (source.includes('tech')) return 'tech';
  if (source.includes('digital') || source.includes('web')) return 'digital';
  if (source.includes('social')) return 'social';
  return '';
}

export function branchMeta(key) {
  return SERVICE_BRANCHES.find((branch) => branch.key === key) || (key === 'general' ? GENERAL_BRANCH : null);
}

export function inquiryUrl({ branch = '', service = '', creative = '' } = {}) {
  const params = new URLSearchParams();
  if (branchMeta(branch)) params.set('branch', branch);
  if (service) params.set('service', slugifyService(service));
  if (creative) params.set('creative', String(creative).trim().toLowerCase());
  const query = params.toString();
  return `/inquiry${query ? `?${query}` : ''}`;
}

export function servicesPath(branch = '') {
  return branchMeta(branch) && branch !== 'general' ? `/services/${branch}` : '/services';
}

export function emptyInquiryDraft(context = {}) {
  return {
    branch: branchMeta(context.branch) ? context.branch : '',
    serviceKey: slugifyService(context.service),
    creativeSlug: String(context.creative || '').trim().toLowerCase(),
    clientName: '',
    organization: '',
    clientEmail: '',
    clientPhone: '',
    preferredContactMethod: 'Email',
    summary: '',
    details: '',
    preferredSchedule: '',
    serviceMode: '',
    generalLocation: '',
    budgetRange: '',
    consent: false,
    honeypot: '',
    branchDetails: {},
    idempotencyKey: globalThis.crypto?.randomUUID?.() || '',
  };
}

export function mergeInquiryContext(draft, context = {}) {
  const next = { ...draft };
  if (branchMeta(context.branch)) next.branch = context.branch;
  if (context.service) next.serviceKey = slugifyService(context.service);
  if (context.creative) next.creativeSlug = String(context.creative).trim().toLowerCase();
  return next;
}

export function validateInquiryStep(step, draft, availableServices = [], eligibleCreatives = []) {
  const errors = {};
  if (step === 0) {
    if (!branchMeta(draft.branch)) errors.branch = 'Choose a service branch.';
    if (draft.branch !== 'general' && !availableServices.some((service) => service.key === draft.serviceKey)) errors.serviceKey = 'Choose an available service.';
  }
  if (step === 1 && draft.creativeSlug && !eligibleCreatives.some((creative) => creative.slug === draft.creativeSlug)) errors.creativeSlug = 'Choose an available creative or the general team.';
  if (step === 2) {
    if (String(draft.summary || '').trim().length < 5) errors.summary = 'Add a short project summary.';
    if (String(draft.details || '').trim().length < 20) errors.details = 'Describe the request in at least 20 characters.';
    if (draft.branch === 'studio' && !String(draft.branchDetails?.eventType || draft.branchDetails?.deliverables || '').trim()) errors.studioDetails = 'Add the event, project type, or expected deliverables.';
    if (draft.branch === 'tech' && !String(draft.branchDetails?.device || '').trim()) errors.device = 'Add the device or platform that needs support.';
    if (draft.branch === 'digital' && !String(draft.branchDetails?.projectGoal || '').trim()) errors.projectGoal = 'Add the digital project goal.';
    if (draft.branch === 'social' && !String(draft.branchDetails?.platforms || '').trim()) errors.platforms = 'Add the social platforms involved.';
  }
  if (step === 3) {
    if (String(draft.clientName || '').trim().length < 2) errors.clientName = 'Enter your name or organization contact.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(draft.clientEmail || '').trim())) errors.clientEmail = 'Enter a valid email address.';
    if (!draft.consent) errors.consent = 'Confirm that the team may contact you about this request.';
  }
  return errors;
}

export function safeInquiryDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const base = emptyInquiryDraft();
  const next = { ...base, ...value, branchDetails: value.branchDetails && typeof value.branchDetails === 'object' ? value.branchDetails : {} };
  if (!branchMeta(next.branch)) next.branch = '';
  next.serviceKey = slugifyService(next.serviceKey);
  next.creativeSlug = String(next.creativeSlug || '').trim().toLowerCase();
  return next;
}

export function referenceIsValid(reference) {
  return REFERENCE_PATTERN.test(String(reference || ''));
}
