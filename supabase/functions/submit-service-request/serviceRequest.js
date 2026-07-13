export const BRANCHES = new Set(['studio', 'tech', 'digital', 'social', 'general']);
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const REFERENCE_PATTERN = /^LLC-\d{4}-[A-Z0-9]{6}$/;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function cleanText(value, max = 5000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function slugify(value = '') {
  return cleanText(value, 120).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export function branchKey(record = {}) {
  const value = `${record.slug || ''} ${record.name || ''}`.toLowerCase();
  if (value.includes('studio')) return 'studio';
  if (value.includes('tech')) return 'tech';
  if (value.includes('digital') || value.includes('web')) return 'digital';
  if (value.includes('social')) return 'social';
  return '';
}

export function generateReference(now = new Date(), randomValues) {
  const bytes = randomValues || crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `LLC-${now.getUTCFullYear()}-${suffix}`;
}

export function validateSubmission(raw = {}) {
  const request = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const normalized = {
    branch: cleanText(request.branch, 20).toLowerCase(),
    serviceKey: slugify(request.serviceKey),
    creativeSlug: cleanText(request.creativeSlug, 120).toLowerCase(),
    clientName: cleanText(request.clientName, 120),
    organization: cleanText(request.organization, 160),
    clientEmail: cleanText(request.clientEmail, 254).toLowerCase(),
    clientPhone: cleanText(request.clientPhone, 120),
    preferredContactMethod: cleanText(request.preferredContactMethod, 80),
    summary: cleanText(request.summary, 160),
    details: cleanText(request.details, 5000),
    preferredSchedule: cleanText(request.preferredSchedule, 240),
    serviceMode: cleanText(request.serviceMode, 80),
    generalLocation: cleanText(request.generalLocation, 240),
    budgetRange: cleanText(request.budgetRange, 120),
    branchDetails: request.branchDetails && typeof request.branchDetails === 'object' && !Array.isArray(request.branchDetails) ? request.branchDetails : {},
    consent: request.consent === true,
    honeypot: cleanText(request.honeypot, 240),
    idempotencyKey: cleanText(request.idempotencyKey, 64),
  };
  const errors = [];
  if (!BRANCHES.has(normalized.branch)) errors.push('Choose an available service branch.');
  if (normalized.branch !== 'general' && !normalized.serviceKey) errors.push('Choose an available service.');
  if (normalized.clientName.length < 2) errors.push('Enter your name or organization contact.');
  if (!EMAIL_PATTERN.test(normalized.clientEmail)) errors.push('Enter a valid email address.');
  if (normalized.summary.length < 5) errors.push('Add a short project summary.');
  if (normalized.details.length < 20) errors.push('Describe the request in at least 20 characters.');
  if (normalized.branch === 'studio' && !cleanText(normalized.branchDetails.eventType || normalized.branchDetails.deliverables, 500)) errors.push('Add the event, project type, or expected deliverables.');
  if (normalized.branch === 'tech' && !cleanText(normalized.branchDetails.device, 500)) errors.push('Add the device or platform that needs support.');
  if (normalized.branch === 'digital' && !cleanText(normalized.branchDetails.projectGoal, 500)) errors.push('Add the digital project goal.');
  if (normalized.branch === 'social' && !cleanText(normalized.branchDetails.platforms, 500)) errors.push('Add the social platforms involved.');
  if (!normalized.preferredContactMethod) errors.push('Choose a preferred contact method.');
  if (!normalized.consent) errors.push('Confirm that the team may contact you about this request.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized.idempotencyKey)) errors.push('This draft cannot be submitted safely. Refresh and try again.');
  return { normalized, errors };
}

export function safeBranchDetails(value = {}) {
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    output[key] = typeof item === 'boolean' ? item : cleanText(item, 500);
  }
  return output;
}

export function notificationPlan({ hasCreative, creativeEmail, adminEmail, clientEmail }) {
  return [
    { key: 'admin', recipient: adminEmail, required: true },
    ...(hasCreative ? [{ key: 'creative', recipient: creativeEmail || '', required: Boolean(creativeEmail) }] : []),
    { key: 'client', recipient: clientEmail, required: true },
  ];
}

export function notificationOutcome(state, hasCreative) {
  const required = ['admin', 'client'];
  if (hasCreative && state.creative !== 'unavailable') required.push('creative');
  const sent = required.filter((key) => state[key] === 'sent').length;
  if (sent === required.length) return 'sent';
  if (sent > 0) return 'partially_sent';
  return 'failed';
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
