import { canonicalServiceKey, serviceCategoriesForBranch, serviceKey } from './serviceCatalog.js';

export const SERVICE_BRANCHES = [
  { key: 'studio', label: 'Liwa Studio', action: 'Request Creative Services', description: 'Tell us what you need for your photo, video, editing, SDE, or highlights project. Share the occasion, preferred style, schedule, and expected output so we can match you with the right creative.' },
  { key: 'tech', label: 'Liwa Tech', action: 'Request Technical Support', description: 'Describe the device, software, setup, or technical issue you need help with. Let us know what is happening, how urgent it is, and whether you prefer remote or on-site support.' },
  { key: 'digital', label: 'Liwa Digital', action: 'Start a Digital Project', description: 'Tell us what you want to build or improve, such as a website, app, system, prototype, or digital product. Share your goal, required features, target users, and preferred timeline.' },
  { key: 'social', label: 'Liwa Social', action: 'Start a Social Media Request', description: 'Tell us what you want to improve or achieve on social media. Share your platforms, content needs, campaign goals, posting support, and any challenges with your current online presence.' },
];

export const GENERAL_BRANCH = { key: 'general', label: 'General', action: 'Describe What You Need', description: 'Describe your project, question, or collaboration idea. Include the result you are aiming for, your preferred timeline, and any details that will help us direct your request to the right team.' };
export const INQUIRY_STEPS = ['Service Category', 'Creative or Team', 'Project Details', 'Schedule and Contact', 'Review'];
export const INQUIRY_DRAFT_KEY = 'lahat-liwa-inquiry-draft-v1';
export const REFERENCE_PATTERN = /^LLC-\d{4}-[A-Z0-9]{6}$/;

export function slugifyService(value = '') {
  return serviceKey(value);
}

export { canonicalServiceKey, serviceCategoriesForBranch };

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

const REPLACED_BRANCH_DESCRIPTION = /(start a guided .+ request|flexible photo, video, editing, and visual-production support|practical technical support for devices, software, setup, troubleshooting|websites, applications, systems, interfaces, and other digital solutions|flexible social-media support for planning, content, account management|planning and shaping social content|photo and video coverage|first-version mindset|simple technical help|everyday computer support)/i;

export function publicBranchDescription(key, configuredDescription = '') {
  const fallback = branchMeta(key)?.description || '';
  const configured = String(configuredDescription || '').trim();
  return !configured || REPLACED_BRANCH_DESCRIPTION.test(configured) ? fallback : configured;
}

export function inquiryUrl({ branch = '', service = '', creative = '' } = {}) {
  const params = new URLSearchParams();
  if (branchMeta(branch)) params.set('branch', branch);
  if (service) params.set('service', canonicalServiceKey(branch, service));
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
    serviceKey: canonicalServiceKey(context.branch, context.service),
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
  if (context.service) next.serviceKey = canonicalServiceKey(next.branch, context.service);
  if (context.creative) next.creativeSlug = String(context.creative).trim().toLowerCase();
  return next;
}

export function validateInquiryStep(step, draft, availableServices = [], eligibleCreatives = []) {
  const errors = {};
  if (step === 0) {
    if (!branchMeta(draft.branch)) errors.branch = 'Choose a service branch.';
    if (!availableServices.some((service) => service.key === draft.serviceKey)) errors.serviceKey = 'Choose an available service category.';
  }
  if (step === 1 && draft.creativeSlug && !eligibleCreatives.some((creative) => creative.slug === draft.creativeSlug)) errors.creativeSlug = 'Choose an available creative or the general team.';
  if (step === 2) {
    if (String(draft.summary || '').trim().length < 5) errors.summary = 'Add a short project summary.';
    if (String(draft.details || '').trim().length < 20) errors.details = 'Describe the request in at least 20 characters.';
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
  next.serviceKey = canonicalServiceKey(next.branch, next.serviceKey);
  next.creativeSlug = String(next.creativeSlug || '').trim().toLowerCase();
  return next;
}

export function referenceIsValid(reference) {
  return REFERENCE_PATTERN.test(String(reference || ''));
}
