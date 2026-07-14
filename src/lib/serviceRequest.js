import { canonicalServiceKey, resolveServiceCategory, serviceCategoriesForBranch, serviceKey } from './serviceCatalog.js';

export const SERVICE_BRANCHES = [
  { key: 'studio', label: 'Liwa Studio', action: 'Request Studio Services', description: 'Tell us about the shoot, coverage, production, or editing request. Share the subject or event, visual style, schedule, and required photos or videos so we can match you with a creative or production specialist.' },
  { key: 'tech', label: 'Liwa Tech', action: 'Request Technical Support', description: 'Describe the device, software, setup, or technical issue that needs attention. Include the symptoms, timing, and preferred support arrangement so a technician or technical specialist can review it.' },
  { key: 'digital', label: 'Liwa Digital', action: 'Start a Digital Request', description: 'Tell us about the website, application, prototype, system, automation, or integration you want to build or improve so a developer or digital specialist can review the requirements.' },
  { key: 'social', label: 'Liwa Social', action: 'Start a Marketing Request', description: 'Tell us about the brand, page, audience, content plan, or campaign that needs support so a social media or marketing specialist can review your goals.' },
];

export const GENERAL_BRANCH = { key: 'general', label: 'General', action: 'Describe What You Need', description: 'Describe your request, question, or collaboration idea. Include the result you are aiming for, your preferred timeline, and enough context for us to direct it to the appropriate Liwa branch.' };
export const INQUIRY_STEPS = ['Service Category', 'Liwa Team', 'Request Details', 'Schedule and Contact', 'Review'];
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
    recipientHelper: 'Choose an available Studio creative or production specialist, or let the Studio team assign the best fit.',
    teamOption: 'Liwa Studio team',
    teamOptionDetail: 'Let the Studio team review the shoot, production, or editing request and assign the best fit.',
    recipientError: 'Please choose an available Studio creative or the Liwa Studio team.',
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
    matchingCopy: 'The Studio team will review the shoot date, location, coverage hours, visual style, output quantity, editing needs, turnaround, and availability of a creative or production specialist.',
    confirmationTitle: 'Your Studio request is safely with the team.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Studio will review the shoot, coverage, production, or editing requirements before confirming availability, timing, or pricing.',
    directoryLabel: 'Explore Studio creatives',
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
    recipientHelper: 'Choose an available developer or digital specialist, or let the Digital team assign the best fit.',
    teamOption: 'Liwa Digital team',
    teamOptionDetail: 'Let the Digital team review the website, application, prototype, or system requirements and assign the best fit.',
    recipientError: 'Please choose an available developer or the Liwa Digital team.',
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
    matchingCopy: 'The Digital team will review the users, features, platform, integrations, content, hosting or domain needs, maintenance expectations, timeline, and availability of a developer or digital specialist.',
    confirmationTitle: 'Your Digital request is safely with the team.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Digital will review the product, website, application, system, or consultation requirements before confirming availability, timing, or pricing.',
    directoryLabel: 'Meet digital specialists',
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
    recipientHelper: 'Choose an available social media or marketing specialist, or let the Social team assign the best fit.',
    teamOption: 'Liwa Social team',
    teamOptionDetail: 'Let the Social team review the page, content, brand, or campaign needs and assign the best fit.',
    recipientError: 'Please choose an available social media specialist or the Liwa Social team.',
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
    matchingCopy: 'The Social team will review the platforms, audience, campaign goal, content calendar, captions, posting frequency, available assets, brand voice, analytics needs, and availability of a social media or marketing specialist.',
    confirmationTitle: 'Your Social request is safely with the team.',
    confirmationDescription: 'Keep your reference number nearby. Liwa Social will review the brand, page, content, or campaign requirements before confirming availability, timing, or pricing.',
    directoryLabel: 'Meet social and marketing specialists',
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
    recipientHelper: 'Choose an available technician or technical specialist, or let the Liwa Tech team assign the best fit.',
    teamOption: 'Liwa Tech team',
    teamOptionDetail: 'Let the technical support team review the device, setup, software, or issue and assign the right specialist.',
    recipientError: 'Please choose an available technician or the Liwa Tech team.',
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
    matchingCopy: 'The Liwa Tech team will review the device type, operating system, symptoms, error messages, software, setup, troubleshooting already attempted, support mode, urgency, and availability of a technician or technical specialist.',
    confirmationTitle: 'Your technical support request is safely with Liwa Tech.',
    confirmationDescription: 'Keep your reference number nearby. A technician or technical specialist will review the device, setup, software, or issue before the team confirms availability, timing, or pricing.',
    directoryLabel: 'Meet technical specialists',
  },
  general: {
    pageEyebrow: 'Liwa service inquiry',
    pageTitle: 'Tell us what you need, one step at a time.',
    pageDescription: 'Choose the closest Liwa branch and service. If you are unsure, select General and give us enough context to direct the request.',
    serviceSelectionHeading: 'Choose the type of support you need.',
    serviceSelectionDescription: 'For requests that may involve one or more Liwa branches, consultation, or general assistance.',
    serviceHelper: 'Choose the closest fit. You can explain the exact goal, situation, and support you need in the next step.',
    submitLabel: 'Send request',
    steps: ['Service category', 'Liwa team member', 'Tell us what you need', 'Schedule and contact', 'Review request'],
    summaryLabel: 'Request summary',
    summaryHelper: 'Give us a short overview so we can direct your request to the appropriate Liwa branch.',
    summaryPlaceholder: 'A short overview of the help or result you need',
    summaryError: 'Please add a short request summary.',
    detailsLabel: 'Describe your request',
    detailsHelper: 'Explain your goal, current situation, expected result, schedule, and any useful background information.',
    detailsPlaceholder: 'Describe what you need, what is happening now, and the result you are hoping for…',
    detailsError: 'Please describe your request in at least 20 characters.',
    examples: [],
    recipientLabel: 'Liwa team member',
    recipientLegend: 'Who should receive this request?',
    recipientHelper: 'Choose an available team member or let the collective direct the request to the appropriate Liwa branch.',
    teamOption: 'General Liwa team',
    teamOptionDetail: 'Let the collective review the request and direct it to the appropriate branch and team member.',
    recipientError: 'Please choose an available team member or the general Liwa team.',
    scheduleLabel: 'Preferred date or timeline',
    schedulePlaceholder: 'Preferred date, range, or timing',
    serviceModeLabel: 'Service arrangement (optional)',
    serviceModes: ['', 'Remote', 'On-site', 'Hybrid', 'To be discussed'],
    locationLabel: 'General location (optional)',
    locationPlaceholder: 'City or general area only',
    reviewFields: [],
    reviewLabel: 'Request details',
    matchingCopy: 'The collective will review your goal, current situation, expected result, schedule, location, and the availability of the appropriate Liwa team member.',
    confirmationTitle: 'Your request is safely with the collective.',
    confirmationDescription: 'Keep your reference number nearby. The team will direct your request to the appropriate Liwa branch before confirming availability, timing, or pricing.',
    directoryLabel: 'Meet the Liwa team',
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
    if (!draft.consent) errors.consent = 'Please confirm that the team may contact you about this request.';
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
