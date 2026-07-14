import { canonicalServiceKey, resolveServiceCategory, serviceCategoriesForBranch, serviceKey } from './serviceCatalog.js';

export const SERVICE_BRANCHES = [
  { key: 'studio', label: 'Liwa Studio', action: 'Request Studio Services', description: 'Tell us about the shoot, coverage, production, or editing request. Share the subject or event, visual style, schedule, and required photos or videos so the requirements can be reviewed clearly.' },
  { key: 'tech', label: 'Liwa Tech', action: 'Request Technical Support', description: 'Describe the device, software, setup, or technical issue that needs attention. Include the symptoms, timing, and preferred support arrangement so a technician or technical specialist can review it.' },
  { key: 'digital', label: 'Liwa Digital', action: 'Start a Digital Request', description: 'Tell us about the website, application, prototype, system, automation, or integration you want to build or improve so a developer or digital specialist can review the requirements.' },
  { key: 'social', label: 'Liwa Social', action: 'Start a Marketing Request', description: 'Tell us about the brand, page, audience, content plan, or campaign that needs support so a social media or marketing specialist can review your goals.' },
];

export const GENERAL_BRANCH = { key: 'general', label: 'General', action: 'Describe What You Need', description: 'Describe your request, question, or collaboration idea. Include the result you are aiming for, your preferred timeline, and enough context for us to direct it to the appropriate Liwa branch.' };
export const INQUIRY_STEPS = ['Service Category', 'Preferred Creative', 'Request Details', 'Schedule and Contact', 'Review'];
export const INQUIRY_SELECTION_STEP = 0;
export const INQUIRY_SPECIALIST_STEP = 1;
export const INQUIRY_DETAILS_STEP = 2;
export const INQUIRY_DRAFT_KEY = 'lahat-liwa-inquiry-draft-v1';
export const REFERENCE_PATTERN = /^LLC-\d{4}-[A-Z0-9]{6}$/;

export const BRANCH_INQUIRY_COPY = {
  studio: {
    pageEyebrow: 'Liwa Studio inquiry',
    pageTitle: 'Plan your shoot, coverage, or editing request.',
    pageDescription: 'Choose the closest Studio service, then tell us about the subject, visual style, schedule, coverage, editing needs, and outputs you expect.',
    serviceSelectionHeading: 'Choose the visual service you need.',
    serviceSelectionDescription: 'For shoots, event coverage, editing, highlights, and other visual work.',
    serviceHelper: 'Choose the closest fit for photography, videography, event coverage, same-day edits, highlights, photo editing, or video editing.',
    submitLabel: 'Send Studio request',
    steps: ['Studio service', 'Creative or production specialist', 'Tell us about the shoot or visual project', 'Schedule and contact', 'Review Studio request'],
    summaryLabel: 'Shoot or production summary',
    summaryHelper: 'Briefly describe what will be photographed, filmed, or edited.',
    summaryPlaceholder: 'Photo and video coverage for a school event',
    summaryError: 'Please add a short shoot or production summary.',
    detailsLabel: 'What visual output do you need?',
    detailsHelper: 'Include the event or subject, preferred style, required photos or videos, coverage duration, editing needs, delivery expectations, and references.',
    detailsPlaceholder: 'We need photo and video coverage for a school event, including edited photos and a same-day highlight video…',
    detailsError: 'Please describe the visual output you need in at least 20 characters.',
    examples: ['We need photo and video coverage for a school event…', 'We already have raw footage and need a 2-minute highlight video…'],
    recipientLabel: 'Creative or production specialist',
    recipientLegend: 'Who should receive this Studio request?',
    recipientHelper: 'Express a preference for a published Studio creative, or continue without choosing a specific person. A preference does not guarantee availability or assignment.',
    teamOption: 'General Studio request',
    teamOptionDetail: 'Send the request to Liwa Studio for review without choosing a specific published creative.',
    recipientError: 'Please choose a published Studio creative or continue with a general Studio request.',
    scheduleLabel: 'Shoot date, event date, or turnaround',
    schedulePlaceholder: 'Event date, coverage hours, or preferred delivery date',
    serviceModeLabel: 'Production arrangement (optional)',
    serviceModes: ['', 'On location', 'Studio shoot', 'Editing only', 'Hybrid', 'To be discussed'],
    locationLabel: 'Shoot or event location (optional)',
    locationPlaceholder: 'Venue, city, or general area',
    reviewFields: [
      ['eventType', 'Shoot, event, or editing request'],
      ['duration', 'Shoot date and coverage hours'],
      ['deliverables', 'Required visual outputs and quantity'],
      ['existingAssets', 'Visual style, references, or existing files'],
    ],
    reviewLabel: 'Visual output requested',
    matchingCopy: 'Liwa Studio will review the shoot date, location, coverage hours, visual style, output quantity, editing needs, turnaround, and available support. A selected creative is a preference, not a guaranteed assignment.',
    confirmationTitle: 'Your Studio inquiry has been received.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Studio will review the shoot, coverage, production, or editing requirements before confirming availability, timing, or pricing.',
    directoryLabel: 'Explore Studio creative profiles',
  },
  digital: {
    pageEyebrow: 'Liwa Digital inquiry',
    pageTitle: 'Shape your website, application, or digital system request.',
    pageDescription: 'Choose the closest Digital service, then describe the users, features, platform, integrations, current setup, and outcome you need.',
    serviceSelectionHeading: 'Choose the digital service you need.',
    serviceSelectionDescription: 'For websites, applications, systems, prototypes, maintenance, and development guidance.',
    serviceHelper: 'Choose the closest fit for a website, application, UI prototype, digital system, integration, automation, maintenance, or consultation.',
    submitLabel: 'Send Digital request',
    steps: ['Digital service', 'Developer or digital specialist', 'Tell us about the digital product or system', 'Timeline and contact', 'Review Digital request'],
    summaryLabel: 'Product or system summary',
    summaryHelper: 'Briefly describe the website, application, prototype, or system you want to build or improve.',
    summaryPlaceholder: 'Website for a small café with a menu and inquiry form',
    summaryError: 'Please add a short product or system summary.',
    detailsLabel: 'What should the product or system accomplish?',
    detailsHelper: 'Describe the users, required features, current setup, preferred platform, integrations, content, technical constraints, and expected result.',
    detailsPlaceholder: 'We need a website for a small café with a menu, content management, and an inquiry form…',
    detailsError: 'Please describe what the product or system should accomplish in at least 20 characters.',
    examples: ['We need a website for a small café with a menu and inquiry form…', 'We have an existing system that needs a new dashboard and user roles…'],
    recipientLabel: 'Developer or digital specialist',
    recipientLegend: 'Who should receive this Digital request?',
    recipientHelper: 'Express a preference for a published developer or digital specialist, or continue without choosing a specific person. A preference does not guarantee availability or assignment.',
    teamOption: 'General Digital request',
    teamOptionDetail: 'Send the request to Liwa Digital for review without choosing a specific published creative.',
    recipientError: 'Please choose a published digital specialist or continue with a general Digital request.',
    scheduleLabel: 'Preferred timeline or launch target',
    schedulePlaceholder: 'Target launch, milestone, or consultation date',
    serviceModeLabel: 'Development arrangement (optional)',
    serviceModes: ['', 'Remote', 'On-site', 'Hybrid', 'Consultation only', 'To be discussed'],
    locationLabel: 'Organization or operating location (optional)',
    locationPlaceholder: 'City, service area, or remote-only',
    reviewFields: [
      ['projectGoal', 'Product or system goal'],
      ['targetUsers', 'Users or audience'],
      ['features', 'Required features and integrations'],
      ['existingSystem', 'Current platform, website, hosting, or domain'],
      ['meetingRequested', 'Development consultation'],
    ],
    reviewLabel: 'Product or system requirements',
    matchingCopy: 'Liwa Digital will review the users, features, platform, integrations, content, hosting or domain needs, maintenance expectations, timeline, and available support. A selected creative is a preference, not a guaranteed assignment.',
    confirmationTitle: 'Your Digital inquiry has been received.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Digital will review the product, website, application, system, or consultation requirements before confirming availability, timing, or pricing.',
    directoryLabel: 'Explore Digital creative profiles',
  },
  social: {
    pageEyebrow: 'Liwa Social inquiry',
    pageTitle: 'Plan your brand, page, content, or campaign support.',
    pageDescription: 'Choose the closest Social service, then describe the audience, platforms, content needs, brand direction, campaign goals, and results you want.',
    serviceSelectionHeading: 'Choose the marketing support you need.',
    serviceSelectionDescription: 'For social media management, content planning, campaigns, branding, and audience growth.',
    serviceHelper: 'Choose the closest fit for social media management, content planning, campaigns, page management, branding support, marketing, or consultation.',
    submitLabel: 'Send Social request',
    steps: ['Social or marketing service', 'Social media or marketing specialist', 'Tell us about your brand or campaign', 'Campaign timing and contact', 'Review Social request'],
    summaryLabel: 'Marketing or social media summary',
    summaryHelper: 'Briefly describe the brand, page, campaign, or audience you need support with.',
    summaryPlaceholder: 'Monthly Facebook content planning and posting for a local café',
    summaryError: 'Please add a short marketing or social media summary.',
    detailsLabel: 'What kind of marketing support do you need?',
    detailsHelper: 'Include your platforms, target audience, campaign goal, posting needs, available assets, brand direction, current challenges, and expected results.',
    detailsPlaceholder: 'We need monthly Facebook content planning, captions, posting, and engagement reporting for a local café…',
    detailsError: 'Please describe the marketing support you need in at least 20 characters.',
    examples: ['We need monthly Facebook content planning and posting for a local café…', 'We are launching a campaign and need strategy, captions, and promotional materials…'],
    recipientLabel: 'Social media or marketing specialist',
    recipientLegend: 'Who should receive this Social request?',
    recipientHelper: 'Express a preference for a published social media or marketing specialist, or continue without choosing a specific person. A preference does not guarantee availability or assignment.',
    teamOption: 'General Social request',
    teamOptionDetail: 'Send the request to Liwa Social for review without choosing a specific published creative.',
    recipientError: 'Please choose a published social or marketing specialist or continue with a general Social request.',
    scheduleLabel: 'Campaign dates or preferred start',
    schedulePlaceholder: 'Launch date, campaign period, or preferred start month',
    serviceModeLabel: 'Working arrangement (optional)',
    serviceModes: ['', 'Remote', 'On-site', 'Hybrid', 'Consultation only', 'To be discussed'],
    locationLabel: 'Audience or business location (optional)',
    locationPlaceholder: 'Primary market, city, or service area',
    reviewFields: [
      ['platforms', 'Platforms or pages'],
      ['campaignGoal', 'Audience and campaign goal'],
      ['postingNeeds', 'Content and posting frequency'],
      ['brandAssets', 'Available assets and brand direction'],
      ['campaignDates', 'Campaign dates or preferred start'],
      ['arrangement', 'Strategy, management, or consultation'],
    ],
    reviewLabel: 'Marketing support requested',
    matchingCopy: 'Liwa Social will review the platforms, audience, campaign goal, content calendar, captions, posting frequency, available assets, brand voice, analytics needs, and available support. A selected creative is a preference, not a guaranteed assignment.',
    confirmationTitle: 'Your Social inquiry has been received.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Social will review the brand, page, content, or campaign requirements before confirming availability, timing, or pricing.',
    directoryLabel: 'Explore Social creative profiles',
  },
  tech: {
    pageEyebrow: 'Liwa Tech support request',
    pageTitle: 'Get help with a device, setup, software, or technical issue.',
    pageDescription: 'Choose the closest Tech service, then describe the device or system, symptoms, software, error messages, support arrangement, and result you need.',
    serviceSelectionHeading: 'Choose the technical support you need.',
    serviceSelectionDescription: 'For computer troubleshooting, device setup, software assistance, system support, and maintenance.',
    serviceHelper: 'Choose the closest fit for troubleshooting, device setup, software assistance, configuration, maintenance, practical IT support, or consultation.',
    submitLabel: 'Send technical support request',
    steps: ['Technical service', 'Technician or technical specialist', 'Tell us about the device or technical issue', 'Support timing and contact', 'Review technical request'],
    summaryLabel: 'Technical request summary',
    summaryHelper: 'Briefly describe the device, setup, software, or issue that needs attention.',
    summaryPlaceholder: 'Windows laptop is very slow and sometimes fails to start',
    summaryError: 'Please add a short technical request summary.',
    detailsLabel: 'What problem or setup do you need help with?',
    detailsHelper: 'Include the device type, operating system, symptoms, error messages, when the problem started, steps already tried, software involved, and whether support is remote or on-site.',
    detailsPlaceholder: 'My Windows laptop has become very slow, sometimes fails to start, and shows an error after signing in…',
    detailsError: 'Please describe the technical issue or setup in at least 20 characters.',
    examples: ['My Windows laptop has become very slow and sometimes fails to start…', 'We need several office computers configured with the required software and user accounts…'],
    recipientLabel: 'Technician or technical specialist',
    recipientLegend: 'Who should receive this technical support request?',
    recipientHelper: 'Express a preference for a published technician or technical specialist, or continue without choosing a specific person. A preference does not guarantee availability or assignment.',
    teamOption: 'General Tech request',
    teamOptionDetail: 'Send the request to Liwa Tech for review without choosing a specific published creative.',
    recipientError: 'Please choose a published technical specialist or continue with a general Tech request.',
    scheduleLabel: 'When do you need technical support?',
    schedulePlaceholder: 'Preferred date, urgency, or available support window',
    serviceModeLabel: 'Support arrangement (optional)',
    serviceModes: ['', 'Remote support', 'On-site support', 'Drop-off', 'Consultation', 'To be discussed'],
    locationLabel: 'Support location (optional)',
    locationPlaceholder: 'City or general area only',
    reviewFields: [
      ['device', 'Device type and operating system'],
      ['issueCategory', 'Symptoms, error message, or software involved'],
      ['supportMode', 'Preferred technical support'],
    ],
    reviewLabel: 'Technical issue or setup',
    matchingCopy: 'Liwa Tech will review the device type, operating system, symptoms, error messages, software, setup, troubleshooting already attempted, support mode, urgency, and available support. A selected creative is a preference, not a guaranteed assignment.',
    confirmationTitle: 'Your technical support inquiry has been received.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Tech will review the device, setup, software, or issue before confirming availability, timing, or pricing.',
    directoryLabel: 'Explore Tech creative profiles',
  },
  general: {
    pageEyebrow: 'Liwa service inquiry',
    pageTitle: 'Tell us what you need, one step at a time.',
    pageDescription: 'Choose the closest Liwa branch and service. If you are unsure, select General and give us enough context to direct the request.',
    serviceSelectionHeading: 'Choose the type of support you need.',
    serviceSelectionDescription: 'For requests that may involve one or more Liwa branches, consultation, or general assistance.',
    serviceHelper: 'Choose the closest fit. You can explain the exact goal, situation, and support you need in the next step.',
    submitLabel: 'Send request',
    steps: ['Service category', 'Preferred published creative', 'Tell us what you need', 'Schedule and contact', 'Review request'],
    summaryLabel: 'Request summary',
    summaryHelper: 'Give us a short overview so we can direct your request to the appropriate Liwa branch.',
    summaryPlaceholder: 'A short overview of the help or result you need',
    summaryError: 'Please add a short request summary.',
    detailsLabel: 'Describe your request',
    detailsHelper: 'Explain your goal, current situation, expected result, schedule, and any useful background information.',
    detailsPlaceholder: 'Describe what you need, what is happening now, and the result you are hoping for…',
    detailsError: 'Please describe your request in at least 20 characters.',
    examples: [],
    recipientLabel: 'Preferred published creative',
    recipientLegend: 'Who should receive this request?',
    recipientHelper: 'Express a preference for a published creative, or continue without choosing a specific person. A preference does not guarantee availability or assignment.',
    teamOption: 'General Liwa request',
    teamOptionDetail: 'Let the platform review the request and direct it to the appropriate branch without choosing a specific published creative.',
    recipientError: 'Please choose a published creative or continue with a general Liwa request.',
    scheduleLabel: 'Preferred date or timeline',
    schedulePlaceholder: 'Preferred date, range, or timing',
    serviceModeLabel: 'Service arrangement (optional)',
    serviceModes: ['', 'Remote', 'On-site', 'Hybrid', 'To be discussed'],
    locationLabel: 'General location (optional)',
    locationPlaceholder: 'City or general area only',
    reviewFields: [],
    reviewLabel: 'Request details',
    matchingCopy: 'The platform will review your goal, current situation, expected result, schedule, location, and available support. A selected creative is a preference, not a guaranteed assignment.',
    confirmationTitle: 'Your inquiry has been received.',
    confirmationDescription: 'Keep your reference number nearby. The request will be reviewed and directed to the appropriate Liwa branch before availability, timing, or pricing is confirmed.',
    directoryLabel: 'Explore published creative profiles',
  },
};

export function inquiryCopy(branch = '') {
  return BRANCH_INQUIRY_COPY[branch] || BRANCH_INQUIRY_COPY.general;
}

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

const GENERAL_TEAM_SELECTIONS = new Set(['team', 'general-team', 'liwa-team', 'branch-team']);

export function resolveInquiryEntry(context = {}, availableBranchKeys = null, eligibleCreatives = []) {
  const branch = String(context.branch || '').trim().toLowerCase();
  const requestedService = context.service || context.serviceKey || '';
  const requestedCreative = String(context.creative || context.creativeSlug || '').trim().toLowerCase();
  const available = Array.isArray(availableBranchKeys) ? new Set(availableBranchKeys) : null;
  const branchAvailable = Boolean(branchMeta(branch)) && (branch === 'general' || !available || available.has(branch));
  if (!branch) return { branch: '', serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'direct' };
  if (!branchAvailable) return { branch: '', serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'invalid-branch' };
  if (!requestedService) return { branch, serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'branch-only' };
  const service = resolveServiceCategory(branch, requestedService);
  if (!service) return { branch, serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'invalid-service' };
  if (!requestedCreative) return { branch, serviceKey: service.key, creativeSlug: '', step: INQUIRY_SPECIALIST_STEP, status: 'specialist' };
  if (GENERAL_TEAM_SELECTIONS.has(requestedCreative)) return { branch, serviceKey: service.key, creativeSlug: '', step: INQUIRY_DETAILS_STEP, status: 'ready-team' };
  const creative = (Array.isArray(eligibleCreatives) ? eligibleCreatives : []).find((item) => item.slug === requestedCreative || item.id === requestedCreative);
  if (!creative) return { branch, serviceKey: service.key, creativeSlug: '', step: INQUIRY_SPECIALIST_STEP, status: 'invalid-specialist' };
  return { branch, serviceKey: service.key, creativeSlug: creative.slug, step: INQUIRY_DETAILS_STEP, status: 'ready-specialist' };
}

export function inquiryNavigationState({ branch = '', service = '', creative = '' } = {}) {
  const entry = resolveInquiryEntry({ branch, service });
  return { inquirySelection: { branch: entry.branch, service: entry.serviceKey, ...(creative ? { creative: String(creative).trim().toLowerCase() } : {}) } };
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

export function changeInquiryBranchSelection(draft = {}, branch = '') {
  const branchChanged = Boolean(draft.branch && draft.branch !== branch);
  return {
    ...draft,
    branch,
    serviceKey: '',
    ...(branchChanged ? {
      creativeSlug: '',
      summary: '',
      details: '',
      serviceMode: '',
      branchDetails: {},
    } : {}),
  };
}

export function buildInquirySubmissionRequest(draft = {}) {
  const branch = branchMeta(draft.branch)?.key || '';
  const service = resolveServiceCategory(branch, draft.serviceKey);
  return {
    ...draft,
    branch,
    serviceKey: service?.key || '',
  };
}

export function validateInquiryStep(step, draft, availableServices = [], eligibleCreatives = []) {
  const errors = {};
  const copy = inquiryCopy(draft.branch);
  if (step === 0) {
    if (!branchMeta(draft.branch)) errors.branch = 'Please choose a service branch before continuing.';
    if (!availableServices.some((service) => service.key === draft.serviceKey)) errors.serviceKey = 'Please choose a service before sending your inquiry.';
  }
  if (step === 1 && draft.creativeSlug && !eligibleCreatives.some((creative) => creative.slug === draft.creativeSlug)) errors.creativeSlug = copy.recipientError;
  if (step === 2) {
    if (String(draft.summary || '').trim().length < 5) errors.summary = copy.summaryError;
    if (String(draft.details || '').trim().length < 20) errors.details = copy.detailsError;
  }
  if (step === 3) {
    if (String(draft.clientName || '').trim().length < 2) errors.clientName = 'Please enter your name or organization contact.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(draft.clientEmail || '').trim())) errors.clientEmail = 'Please enter a valid email address.';
    if (!draft.consent) errors.consent = 'Please confirm that Lahat Liwa may contact you about this request.';
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
