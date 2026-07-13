import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { branchKey, cleanText, deliverNotificationPlan, EMAIL_PATTERN, escapeHtml, generateReference, safeBranchDetails, slugify, validateSubmission } from './serviceRequest.js';

const jsonHeaders = { 'Content-Type': 'application/json' };
const reply = (body: unknown, status = 200, cors = {}) => new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...cors } });
const fail = (code: string, message: string, status: number, cors = {}) => reply({ success: false, code, message }, status, cors);

function corsHeaders(req: Request, siteUrl: string) {
  const origin = req.headers.get('Origin') || '';
  const allowed = new Set([siteUrl.replace(/\/$/, ''), 'http://localhost:5173', 'http://127.0.0.1:5173']);
  return {
    ...(allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function publicSiteUrl(value: string) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.origin : ''; } catch { return ''; }
}

function branchLabel(branch: string) {
  return branch === 'general' ? 'General inquiry' : `Liwa ${branch[0].toUpperCase()}${branch.slice(1)}`;
}

function emailHtml(title: string, inquiry: any, siteUrl: string, includeAdminLink = false) {
  const rows = [
    ['Reference', inquiry.public_reference], ['Client', inquiry.name], ['Branch', branchLabel(inquiry.branch)],
    ['Service', inquiry.project_type], ['Selected creative', inquiry.creative_name], ['Preferred contact', inquiry.preferred_contact],
    ['Schedule', inquiry.preferred_schedule || 'To be discussed'], ['Summary', inquiry.summary],
  ].filter(([, value]) => value);
  return `<!doctype html><html><body style="margin:0;background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px 20px"><p style="color:#fdba74;font-size:12px;letter-spacing:.16em;text-transform:uppercase">Lahat Liwa Collectives</p><h1 style="font-size:24px">${escapeHtml(title)}</h1>${rows.map(([label, value]) => `<div style="border-top:1px solid #27272a;padding:12px 0"><small style="color:#71717a;text-transform:uppercase">${escapeHtml(label)}</small><div style="margin-top:5px;line-height:1.6">${escapeHtml(value)}</div></div>`).join('')}<div style="border-top:1px solid #27272a;padding:16px 0"><small style="color:#71717a;text-transform:uppercase">Request details</small><p style="white-space:pre-wrap;line-height:1.65">${escapeHtml(inquiry.details)}</p></div>${includeAdminLink ? `<p><a href="${escapeHtml(`${siteUrl}/admin/inquiries?reference=${encodeURIComponent(inquiry.public_reference)}`)}" style="color:#fdba74">Open in the inquiry dashboard</a></p>` : `<p style="color:#a1a1aa;line-height:1.6">This confirms receipt only. Availability, timing, pricing, and meetings remain subject to team review.</p><p><a href="${escapeHtml(siteUrl)}" style="color:#fdba74">Visit Lahat Liwa Collectives</a></p>`}</div></body></html>`;
}

async function sendEmail(apiKey: string, payload: any) {
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}

async function resolveCreative(admin: any, slug: string) {
  if (!slug) return null;
  const { data: creative, error } = await admin.from('creative_members').select('id, name, slug, role, is_published').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (error) throw error;
  if (!creative) return null;
  const { data: team, error: teamError } = await admin.from('admin_users').select('id').eq('creative_member_id', creative.id).eq('status', 'active').not('user_id', 'is', null).maybeSingle();
  if (teamError) throw teamError;
  if (!team) return null;
  return creative;
}

async function resolveCreativeById(admin: any, id: string) {
  if (!id) return null;
  const { data, error } = await admin.from('creative_members').select('slug').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.slug ? resolveCreative(admin, data.slug) : null;
}

async function resolveCreativeNotificationEmail(admin: any, creativeId: string) {
  if (!creativeId) return { email: '', reason: 'missing_creative' };
  try {
    const { data: preference, error: preferenceError } = await admin.from('creative_notification_preferences').select('notification_email').eq('creative_member_id', creativeId).maybeSingle();
    if (preferenceError) throw preferenceError;
    const preferredEmail = cleanText(preference?.notification_email, 254).toLowerCase();
    if (preferredEmail) return EMAIL_PATTERN.test(preferredEmail)
      ? { email: preferredEmail, reason: 'creative_preference' }
      : { email: '', reason: 'invalid_preference' };

    const { data: team, error: teamError } = await admin.from('admin_users').select('email').eq('creative_member_id', creativeId).eq('status', 'active').not('user_id', 'is', null).maybeSingle();
    if (teamError) throw teamError;
    const accountEmail = cleanText(team?.email, 254).toLowerCase();
    return EMAIL_PATTERN.test(accountEmail)
      ? { email: accountEmail, reason: 'active_team_account' }
      : { email: '', reason: 'missing_valid_email' };
  } catch (error) {
    console.error('[service-request] creative notification address resolution failed', { creativeId, code: (error as any)?.code || 'QUERY_FAILED' });
    return { email: '', reason: 'resolution_failed' };
  }
}

async function deliverNotifications(admin: any, inquiry: any, creative: any, config: any) {
  inquiry.creative_name = creative?.name || '';
  const state = { ...(inquiry.notification_state || {}) };
  if (creative && !creative.notificationEmail) state.creative_resolution = creative.notificationReason || 'missing_valid_email';
  const { nextState, failures, notificationStatus } = await deliverNotificationPlan({
    hasCreative: Boolean(creative),
    creativeEmail: creative?.notificationEmail || '',
    adminEmail: config.adminEmail,
    clientEmail: inquiry.client_email,
    state,
    send: async (item: any) => {
      const isClient = item.key === 'client';
      const isCreative = item.key === 'creative';
      const isFallback = item.key === 'admin_fallback';
      const title = isClient
        ? 'We received your inquiry'
        : isCreative
          ? 'A visitor selected you for a project inquiry'
          : isFallback
            ? 'A creative inquiry needs fallback review'
            : 'A new service inquiry needs review';
      const subject = isClient
        ? `We received your inquiry — ${inquiry.public_reference}`
        : isCreative
          ? `New project inquiry for you — ${inquiry.public_reference}`
          : isFallback
            ? `Fallback required for creative inquiry — ${inquiry.public_reference}`
            : `New ${branchLabel(inquiry.branch)} inquiry — ${inquiry.public_reference}`;
      await sendEmail(config.apiKey, {
        from: config.fromEmail,
        to: [item.recipient],
        reply_to: isClient ? config.adminEmail : inquiry.client_email,
        subject,
        html: emailHtml(title, inquiry, config.siteUrl, !isClient),
      });
    },
  });
  const { error } = await admin.from('project_inquiries').update({ notification_status: notificationStatus, notification_state: nextState, notification_attempts: Number(inquiry.notification_attempts || 0) + 1, notification_error: failures.join('; ').slice(0, 1000) || null, notified_at: notificationStatus === 'sent' ? new Date().toISOString() : inquiry.notified_at }).eq('id', inquiry.id);
  if (error) console.error('[service-request] notification state update failed', { reference: inquiry.public_reference, code: error.code });
  return notificationStatus;
}

async function authorizedAdmin(req: Request, url: string, anonKey: string, admin: any) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return null;
  const { data } = await admin.from('admin_users').select('id').eq('user_id', user.id).eq('status', 'active').in('role', ['super_admin', 'owner', 'admin']).maybeSingle();
  return data ? user : null;
}

Deno.serve(async (req) => {
  const siteUrl = publicSiteUrl(Deno.env.get('PUBLIC_SITE_URL') || '');
  const cors = corsHeaders(req, siteUrl);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!siteUrl || !cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);
  const contentLength = Number(req.headers.get('Content-Length') || 0);
  if (contentLength > 60000) return fail('REQUEST_TOO_LARGE', 'The request is too large.', 413, cors);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rateSecret = Deno.env.get('INQUIRY_RATE_LIMIT_SECRET');
  const emailConfig = { apiKey: Deno.env.get('RESEND_API_KEY') || '', fromEmail: Deno.env.get('INQUIRY_FROM_EMAIL') || '', adminEmail: Deno.env.get('INQUIRY_ADMIN_EMAIL') || 'lahatliwa.collectives@gmail.com', siteUrl };
  if (!url || !anonKey || !serviceKey || !rateSecret) return fail('SERVER_CONFIGURATION', 'The inquiry service is temporarily unavailable.', 503, cors);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 60000) return fail('REQUEST_TOO_LARGE', 'The request is too large.', 413, cors);
    const body = JSON.parse(rawBody);
    if (body?.action === 'retry_notification') {
      if (!(await authorizedAdmin(req, url, anonKey, admin))) return fail('NOT_AUTHORIZED', 'Only an authorized administrator can retry notifications.', 403, cors);
      const reference = cleanText(body.reference, 40);
      const { data: inquiry, error } = await admin.from('project_inquiries').select('*').eq('public_reference', reference).maybeSingle();
      if (error || !inquiry) return fail('INQUIRY_NOT_FOUND', 'The inquiry could not be found.', 404, cors);
      const creativeId = inquiry.assigned_creative_id || inquiry.preferred_creative_id || '';
      if (!emailConfig.apiKey || !emailConfig.fromEmail) return fail('EMAIL_NOT_CONFIGURED', 'Email delivery is not configured.', 503, cors);
      let creative = null;
      try {
        creative = await resolveCreativeById(admin, creativeId);
      } catch (resolveError) {
        console.error('[service-request] retry creative lookup failed', { creativeId, code: (resolveError as any)?.code || 'QUERY_FAILED' });
      }
      if (creativeId) {
        const address = await resolveCreativeNotificationEmail(admin, creativeId);
        creative = { ...(creative || { id: creativeId, name: 'Selected creative' }), notificationEmail: address.email, notificationReason: address.reason };
      }
      const notificationStatus = await deliverNotifications(admin, inquiry, creative, emailConfig);
      return reply({ success: true, notificationStatus }, 200, cors);
    }

    if (body?.action !== 'submit') return fail('INVALID_ACTION', 'The requested action is invalid.', 400, cors);
    const { normalized, errors } = validateSubmission(body.request);
    if (normalized.honeypot) return fail('SUBMISSION_REJECTED', 'The request could not be submitted.', 400, cors);
    if (errors.length) return reply({ success: false, code: 'VALIDATION_FAILED', message: errors[0], errors }, 400, cors);

    const clientIp = cleanText(req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unavailable', 80);
    const submitterHash = await sha256(`${rateSecret}:${clientIp}`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: rateError } = await admin.from('project_inquiries').select('id', { count: 'exact', head: true }).eq('submitter_hash', submitterHash).gte('created_at', since);
    if (rateError) return fail('SAFETY_CHECK_FAILED', 'The request could not be safely checked. Please try again later.', 503, cors);
    if ((count || 0) >= 5) return fail('RATE_LIMITED', 'Too many requests were submitted. Please wait before trying again.', 429, cors);

    const { data: existing, error: existingError } = await admin.from('project_inquiries').select('public_reference, created_at').eq('idempotency_key', normalized.idempotencyKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return reply({ success: true, reference: existing.public_reference, submittedAt: existing.created_at, duplicate: true }, 200, cors);

    let serviceName = 'General inquiry';
    if (normalized.branch !== 'general') {
      const { data: branchRows, error: branchError } = await admin.from('service_branches').select('name, slug, included_services').eq('is_published', true);
      if (branchError) throw branchError;
      const branch = (branchRows || []).find((row: any) => branchKey(row) === normalized.branch);
      if (!branch) return fail('INVALID_BRANCH', 'The selected service branch is unavailable.', 400, cors);
      const service = (branch.included_services || []).find((name: string) => slugify(name) === normalized.serviceKey);
      if (!service) return fail('INVALID_SERVICE', 'The selected service is unavailable.', 400, cors);
      serviceName = cleanText(service, 120);
    }

    const creative = normalized.creativeSlug ? await resolveCreative(admin, normalized.creativeSlug) : null;
    if (normalized.creativeSlug && !creative) return fail('INVALID_CREATIVE', 'The selected creative is unavailable. Choose another creative or the general team.', 400, cors);

    const requestedSourcePath = cleanText(body.sourcePath, 500);
    const sourcePath = /^\/(?:inquiry|start-a-project)(?:\?|$)/.test(requestedSourcePath) && !requestedSourcePath.includes('//') ? requestedSourcePath : '/inquiry';
    const payload: any = {
      name: normalized.clientName, email_or_contact: normalized.clientEmail, organization: normalized.organization || null,
      project_type: serviceName, budget_range: normalized.budgetRange || null, preferred_contact: normalized.preferredContactMethod,
      message: normalized.details, status: 'new', branch: normalized.branch, service_key: normalized.serviceKey,
      client_email: normalized.clientEmail, client_phone: normalized.clientPhone || null, summary: normalized.summary,
      details: normalized.details, preferred_schedule: normalized.preferredSchedule || null, service_mode: normalized.serviceMode || null,
      general_location: normalized.generalLocation || null, request_metadata: safeBranchDetails(normalized.branchDetails), source_path: sourcePath || null,
      preferred_creative_id: creative?.id || null, assigned_creative_id: creative?.id || null, idempotency_key: normalized.idempotencyKey, submitter_hash: submitterHash,
      notification_status: 'pending', notification_state: {}, unread: true,
    };
    let inquiry;
    let insertError;
    for (let attempt = 0; attempt < 3 && !inquiry; attempt += 1) {
      payload.public_reference = generateReference();
      const result = await admin.from('project_inquiries').insert(payload).select('*').single();
      inquiry = result.data; insertError = result.error;
      if (insertError?.code !== '23505') break;
    }
    if (insertError || !inquiry) throw insertError || new Error('Inquiry insert failed.');

    let notificationStatus = 'failed';
    if (emailConfig.apiKey && emailConfig.fromEmail) {
      let deliveryCreative = creative;
      if (creative) {
        const address = await resolveCreativeNotificationEmail(admin, creative.id);
        deliveryCreative = { ...creative, notificationEmail: address.email, notificationReason: address.reason };
      }
      notificationStatus = await deliverNotifications(admin, inquiry, deliveryCreative, emailConfig);
    }
    else await admin.from('project_inquiries').update({ notification_status: 'failed', notification_attempts: 1, notification_error: 'Email delivery is not configured.' }).eq('id', inquiry.id);

    console.log('[service-request] inquiry saved', { reference: inquiry.public_reference, branch: inquiry.branch, hasCreative: Boolean(creative), notificationStatus });
    return reply({ success: true, reference: inquiry.public_reference, submittedAt: inquiry.created_at }, 201, cors);
  } catch (error) {
    console.error('[service-request] request failed', { code: (error as any)?.code || 'UNEXPECTED_ERROR', message: error instanceof Error ? error.message : 'Unexpected error' });
    return fail('SUBMISSION_FAILED', 'The inquiry could not be submitted. Please try again.', 500, cors);
  }
});
