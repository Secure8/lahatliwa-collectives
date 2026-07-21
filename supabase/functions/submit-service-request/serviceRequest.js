import { canonicalServiceKey } from '../../../src/lib/serviceCatalog.js';

export const BRANCHES = new Set(['studio', 'tech', 'digital', 'social', 'general']);
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const REFERENCE_PATTERN = /^LLC-\d{4}-[A-Z0-9]{6}$/;
const EDITORIAL_TYPES = new Set(['journal', 'event', 'place', 'activity', 'local_product']);
const INQUIRY_KINDS = new Set(['service', 'tourism', 'general']);
const TOURISM_CATEGORIES = new Set(['destination-information', 'event-or-activity', 'local-product', 'tourism-question', 'correction-or-concern']);
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
  if (value.includes('tech') || value.includes('explore')) return 'tech';
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
  const branch = cleanText(request.branch, 20).toLowerCase();
  const normalized = {
    branch,
    serviceKey: canonicalServiceKey(branch, request.serviceKey),
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
    inquiryKind: INQUIRY_KINDS.has(cleanText(request.inquiryKind, 20).toLowerCase()) ? cleanText(request.inquiryKind, 20).toLowerCase() : 'service',
    inquiryCategory: cleanText(request.inquiryCategory, 60).toLowerCase(),
    editorialContext: safeEditorialContext(request.editorialContext),
    projectContext: safeProjectContext(request.projectContext),
    consent: request.consent === true,
    honeypot: cleanText(request.honeypot, 240),
    idempotencyKey: cleanText(request.idempotencyKey, 64),
  };
  const errors = [];
  if (!BRANCHES.has(normalized.branch)) errors.push('Choose an available service branch.');
  if (!normalized.serviceKey) errors.push('Choose an available service category.');
  if (normalized.inquiryKind === 'tourism' && !TOURISM_CATEGORIES.has(normalized.inquiryCategory)) errors.push('Choose an available tourism inquiry topic.');
  if (normalized.clientName.length < 2) errors.push('Enter your name or organization contact.');
  if (!EMAIL_PATTERN.test(normalized.clientEmail)) errors.push('Enter a valid email address.');
  if (normalized.summary.length < 5) errors.push('Add a short project summary.');
  if (normalized.details.length < 20) errors.push('Describe the request in at least 20 characters.');
  if (!normalized.preferredContactMethod) errors.push('Choose a preferred contact method.');
  if (!normalized.consent) errors.push('Confirm that the team may contact you about this request.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized.idempotencyKey)) errors.push('This draft cannot be submitted safely. Refresh and try again.');
  return { normalized, errors };
}

export function safeEditorialContext(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = cleanText(value.type, 40).toLowerCase();
  const slug = cleanText(value.slug, 120).toLowerCase();
  const title = cleanText(value.title, 180);
  const id = cleanText(value.id || value.postId, 36).toLowerCase();
  if (!EDITORIAL_TYPES.has(type) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return null;
  return {
    type,
    slug,
    title,
    ...(id ? { id } : {}),
    publicUrl: cleanText(value.publicUrl, 500),
    municipality: cleanText(value.municipality, 120),
    inquiryCategory: TOURISM_CATEGORIES.has(cleanText(value.inquiryCategory, 60).toLowerCase()) ? cleanText(value.inquiryCategory, 60).toLowerCase() : '',
    sourceAction: cleanText(value.sourceAction, 80),
  };
}

export function safeProjectContext(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 36).toLowerCase();
  const slug = cleanText(value.slug, 120).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return { id, type: 'project', slug, title: cleanText(value.title, 180), sourceAction: cleanText(value.sourceAction, 80) || 'project-detail-inquiry' };
}

export function safeBranchDetails(value = {}) {
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    output[key] = typeof item === 'boolean' ? item : cleanText(item, 500);
  }
  return output;
}

export function notificationOutcome(state, hasCreative) {
  const internalSent = hasCreative
    ? state.creative === 'sent' || state.admin_fallback === 'sent'
    : state.admin === 'sent';
  const clientSent = state.client === 'sent';
  const usedFallback = hasCreative && state.creative !== 'sent' && state.admin_fallback === 'sent';
  if (internalSent && clientSent) return usedFallback ? 'partially_sent' : 'sent';
  if (internalSent || clientSent) return 'partially_sent';
  return 'failed';
}

export async function deliverNotificationPlan({ hasCreative, creativeEmail, adminEmail, clientEmail, state = {}, send }) {
  const nextState = { ...state };
  const failures = [];

  async function attempt(key, recipient) {
    if (!recipient || nextState[key] === 'sent') return;
    try {
      await send({ key, recipient });
      nextState[key] = 'sent';
    } catch (error) {
      nextState[key] = 'failed';
      failures.push(`${key}: ${error instanceof Error ? error.message : 'delivery failed'}`);
    }
  }

  if (hasCreative) {
    if (creativeEmail) await attempt('creative', creativeEmail);
    else if (nextState.creative !== 'sent') nextState.creative = 'unavailable';
    if (nextState.creative !== 'sent') await attempt('admin_fallback', adminEmail);
  } else {
    await attempt('admin', adminEmail);
  }
  await attempt('client', clientEmail);

  return {
    nextState,
    failures,
    notificationStatus: notificationOutcome(nextState, hasCreative),
  };
}

export async function deliverGeneralNotificationPlan({ recipients = [], adminEmail, clientEmail, state = {}, resolutionFailed = false, send }) {
  const nextState = { ...state, creative_recipients: { ...(state.creative_recipients || {}) } };
  const deliveries = [];
  const failures = [];
  const normalizedAdmin = String(adminEmail || '').trim().toLowerCase();
  const seenInternalAddresses = new Set(normalizedAdmin ? [normalizedAdmin] : []);

  async function attempt({ key, recipient, kind, memberId = null }) {
    if (nextState[key] === 'sent') {
      deliveries.push({ key, memberId, kind, status: 'sent', skippedRetry: true });
      return;
    }
    try {
      await send({ key, recipient, kind, memberId });
      nextState[key] = 'sent';
      deliveries.push({ key, memberId, kind, status: 'sent' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery failed';
      nextState[key] = 'failed';
      failures.push(`${key}: ${message}`);
      deliveries.push({ key, memberId, kind, status: 'failed', error: message });
    }
  }

  await attempt({ key: 'admin', recipient: normalizedAdmin, kind: 'admin' });
  if (resolutionFailed) {
    nextState.creative_resolution = 'failed';
    failures.push('creative-resolution: recipient lookup failed');
    deliveries.push({ key: 'creative-resolution', memberId: null, kind: 'creative', status: 'failed', error: 'Recipient lookup failed.' });
  }
  for (const item of recipients) {
    const memberId = String(item.memberId || 'unknown');
    const recipient = String(item.email || '').trim().toLowerCase();
    const key = `creative:${memberId}`;
    if (!recipient) {
      const resolutionFailed = item.reason === 'resolution_failed';
      nextState.creative_recipients[memberId] = resolutionFailed ? 'failed' : 'skipped';
      if (resolutionFailed) failures.push(`${key}: recipient lookup failed`);
      deliveries.push({ key, memberId, kind: 'creative', status: resolutionFailed ? 'failed' : 'skipped', reason: item.reason || 'missing_valid_email', ...(resolutionFailed ? { error: 'Recipient lookup failed.' } : {}) });
      continue;
    }
    if (seenInternalAddresses.has(recipient)) {
      nextState.creative_recipients[memberId] = 'skipped';
      deliveries.push({ key, memberId, kind: 'creative', status: 'skipped', reason: 'duplicate_recipient' });
      continue;
    }
    seenInternalAddresses.add(recipient);
    if (nextState.creative_recipients[memberId] === 'sent') {
      deliveries.push({ key, memberId, kind: 'creative', status: 'sent', skippedRetry: true });
      continue;
    }
    try {
      await send({ key, recipient, kind: 'creative', memberId });
      nextState.creative_recipients[memberId] = 'sent';
      deliveries.push({ key, memberId, kind: 'creative', status: 'sent' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery failed';
      nextState.creative_recipients[memberId] = 'failed';
      failures.push(`${key}: ${message}`);
      deliveries.push({ key, memberId, kind: 'creative', status: 'failed', error: message });
    }
  }
  await attempt({ key: 'client', recipient: clientEmail, kind: 'client' });

  const statuses = deliveries.filter((item) => !item.skippedRetry).map((item) => item.status);
  const hasFailure = statuses.includes('failed');
  const hasSent = statuses.includes('sent');
  return {
    nextState,
    deliveries,
    failures,
    notificationStatus: hasFailure ? (hasSent ? 'partially_sent' : 'failed') : 'sent',
  };
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}
