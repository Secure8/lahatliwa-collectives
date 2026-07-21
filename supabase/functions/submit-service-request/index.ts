import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { branchKey, cleanText, deliverGeneralNotificationPlan, deliverNotificationPlan, EMAIL_PATTERN, escapeHtml, generateReference, safeBranchDetails, validateSubmission } from './serviceRequest.js';
import { resolveServiceCategory } from '../../../src/lib/serviceCatalog.js';

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
  if (branch === 'general') return 'General inquiry';
  if (branch === 'tech') return 'Liwa Explore';
  return `Liwa ${branch[0].toUpperCase()}${branch.slice(1)}`;
}

function editorialPublicPath(type: string, slug: string) {
  const roots: Record<string, string> = { journal: 'journal', event: 'events', place: 'places', activity: 'activities', local_product: 'local-products' };
  return roots[type] && slug ? `/${roots[type]}/${encodeURIComponent(slug)}` : '';
}

function emailHtml(title: string, inquiry: any, siteUrl: string, includeAdminLink = false) {
  const rows = [
    ['Reference', inquiry.public_reference], ['Client', inquiry.name], ['Branch', branchLabel(inquiry.branch)],
    ['Service category', inquiry.project_type], ['Selected creative', inquiry.creative_name], ['Preferred contact', inquiry.preferred_contact],
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
  return { ...creative, teamMemberId: team.id };
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

async function resolveGeneralCreativeRecipients(admin: any) {
  try {
    const { data: members, error, count } = await admin.from('admin_users')
      .select('id, creative_member_id', { count: 'exact' })
      .eq('status', 'active')
      .not('user_id', 'is', null)
      .not('creative_member_id', 'is', null)
      .in('role', ['super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'])
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    if ((count || 0) > 500) throw new Error('Eligible creative recipient limit exceeded.');
    const recipients = [];
    for (let offset = 0; offset < (members || []).length; offset += 20) {
      const batch = (members || []).slice(offset, offset + 20);
      const resolved = await Promise.all(batch.map(async (member: any) => {
        const address = await resolveCreativeNotificationEmail(admin, member.creative_member_id);
        return { memberId: member.id, email: address.email, reason: address.reason };
      }));
      recipients.push(...resolved);
    }
    return { recipients, resolutionFailed: false };
  } catch (error) {
    console.error('[service-request] general creative recipient resolution failed', { code: (error as any)?.code || 'QUERY_FAILED' });
    return { recipients: [], resolutionFailed: true };
  }
}

async function recordDeliveryAttempts(admin: any, inquiryId: string, deliveries: any[]) {
  const recordable = deliveries.filter((item) => !item.skippedRetry);
  if (!recordable.length) return;
  const keys = recordable.map((item) => item.key);
  const { data: existing, error: existingError } = await admin.from('inquiry_delivery_attempts')
    .select('delivery_key, attempts')
    .eq('inquiry_id', inquiryId)
    .in('delivery_key', keys);
  if (existingError) {
    console.error('[service-request] delivery history lookup failed', { inquiryId, code: existingError.code });
    return;
  }
  const attempts = new Map((existing || []).map((item: any) => [item.delivery_key, Number(item.attempts || 0)]));
  const now = new Date().toISOString();
  const rows = recordable.map((item) => ({
    inquiry_id: inquiryId,
    delivery_key: item.key,
    recipient_member_id: item.memberId || null,
    recipient_kind: item.kind,
    status: item.status,
    attempts: item.status === 'skipped' ? (attempts.get(item.key) || 0) : (attempts.get(item.key) || 0) + 1,
    last_error: item.status === 'failed' ? 'Delivery failed.' : item.reason || null,
    last_attempted_at: item.status === 'skipped' ? null : now,
    sent_at: item.status === 'sent' ? now : null,
    updated_at: now,
  }));
  const { error } = await admin.from('inquiry_delivery_attempts').upsert(rows, { onConflict: 'inquiry_id,delivery_key' });
  if (error) console.error('[service-request] delivery history update failed', { inquiryId, code: error.code });
}

async function deliverNotifications(admin: any, inquiry: any, creative: any, config: any) {
  inquiry.creative_name = creative?.name || '';
  const state = { ...(inquiry.notification_state || {}) };
  if (!creative) {
    const recipientResult = await resolveGeneralCreativeRecipients(admin);
    const { nextState, failures, notificationStatus, deliveries } = await deliverGeneralNotificationPlan({
      recipients: recipientResult.recipients,
      resolutionFailed: recipientResult.resolutionFailed,
      adminEmail: config.adminEmail,
      clientEmail: inquiry.client_email,
      state,
      send: async (item: any) => {
        const isClient = item.kind === 'client';
        const isCreative = item.kind === 'creative';
        const title = isClient ? 'We received your inquiry' : isCreative ? 'A general inquiry is open to the creative Team' : 'A new service inquiry needs review';
        const subject = isClient
          ? `We received your inquiry — ${inquiry.public_reference}`
          : isCreative
            ? `New general inquiry — ${inquiry.public_reference}`
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
    await recordDeliveryAttempts(admin, inquiry.id, deliveries);
    const { error } = await admin.from('project_inquiries').update({ notification_status: notificationStatus, notification_state: nextState, notification_attempts: Number(inquiry.notification_attempts || 0) + 1, notification_error: failures.join('; ').slice(0, 1000) || null, notified_at: notificationStatus === 'sent' ? new Date().toISOString() : inquiry.notified_at }).eq('id', inquiry.id);
    if (error) console.error('[service-request] notification state update failed', { reference: inquiry.public_reference, code: error.code });
    return notificationStatus;
  }
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
  const { data } = await admin.from('admin_users').select('id').eq('user_id', user.id).eq('status', 'active').in('role', ['super_admin', 'owner']).maybeSingle();
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

    let resolvedService = resolveServiceCategory('general', normalized.serviceKey);
    if (normalized.branch !== 'general') {
      const { data: branchRows, error: branchError } = await admin.from('service_branches').select('name, slug, included_services').eq('is_published', true);
      if (branchError) throw branchError;
      const branch = (branchRows || []).find((row: any) => branchKey(row) === normalized.branch);
      if (!branch) return fail('INVALID_BRANCH', 'The selected service branch is unavailable.', 400, cors);
      resolvedService = resolveServiceCategory(normalized.branch, normalized.serviceKey, branch.included_services || []);
    }
    if (!resolvedService) return fail('INVALID_SERVICE', 'The selected service category is unavailable.', 400, cors);
    const serviceName = cleanText(resolvedService.name, 120);
    const canonicalServiceKey = cleanText(resolvedService.key, 80);

    const creative = normalized.creativeSlug ? await resolveCreative(admin, normalized.creativeSlug) : null;
    if (normalized.creativeSlug && !creative) return fail('INVALID_CREATIVE', 'The selected creative is unavailable. Choose another creative or the general team.', 400, cors);

    const requestedSourcePath = cleanText(body.sourcePath, 500);
    const sourcePath = /^\/(?:inquiry|start-a-project)(?:\?|$)/.test(requestedSourcePath) && !requestedSourcePath.includes('//') ? requestedSourcePath : '/inquiry';
    const payload: any = {
      name: normalized.clientName, email_or_contact: normalized.clientEmail, organization: normalized.organization || null,
      project_type: serviceName, budget_range: normalized.budgetRange || null, preferred_contact: normalized.preferredContactMethod,
      message: normalized.details, status: 'new', branch: normalized.branch, service_key: canonicalServiceKey,
      client_email: normalized.clientEmail, client_phone: normalized.clientPhone || null, summary: normalized.summary,
      details: normalized.details, preferred_schedule: normalized.preferredSchedule || null, service_mode: normalized.serviceMode || null,
      general_location: normalized.generalLocation || null, request_metadata: { ...safeBranchDetails(normalized.branchDetails), inquiry_kind: normalized.inquiryKind, ...(normalized.inquiryCategory ? { inquiry_category: normalized.inquiryCategory } : {}) }, source_path: sourcePath || null,
      preferred_creative_id: creative?.id || null, assigned_creative_id: creative?.id || null, idempotency_key: normalized.idempotencyKey, submitter_hash: submitterHash,
      notification_status: 'pending', notification_state: {}, unread: true,
    };
    if (normalized.editorialContext) {
      const [{ data: flags, error: flagError }, { data: editorialPost, error: postError }] = await Promise.all([
        admin.from('editorial_feature_flags').select('module_enabled,public_inquiries_enabled').eq('singleton', true).maybeSingle(),
        admin.from('editorial_posts').select('id,content_type,slug,title,published_revision_id,published_at,archived_at,editorial_municipalities(name)').eq('content_type', normalized.editorialContext.type).eq('slug', normalized.editorialContext.slug).eq('status', 'published').not('published_revision_id', 'is', null).not('published_at', 'is', null).is('archived_at', null).maybeSingle(),
      ]);
      if (flagError || postError) return fail('EDITORIAL_CONTEXT_UNAVAILABLE', 'This page context could not be verified. Start a general inquiry instead.', 503, cors);
      if (!flags?.module_enabled || !flags?.public_inquiries_enabled) return fail('EDITORIAL_INQUIRY_DISABLED', 'Inquiries for tourism pages are not available yet.', 409, cors);
      if (!editorialPost) return fail('EDITORIAL_CONTEXT_INVALID', 'The linked tourism page is no longer available.', 400, cors);
      if (normalized.editorialContext.id && normalized.editorialContext.id !== editorialPost.id) return fail('EDITORIAL_CONTEXT_INVALID', 'The linked tourism page could not be verified.', 400, cors);
      const verifiedPath = editorialPublicPath(editorialPost.content_type, editorialPost.slug);
      payload.request_metadata = { ...payload.request_metadata, editorial_content_id: editorialPost.id, editorial_content_type: editorialPost.content_type, editorial_content_slug: editorialPost.slug, editorial_content_title: editorialPost.title, editorial_public_path: verifiedPath, editorial_municipality: editorialPost.editorial_municipalities?.name || '', source_action: normalized.editorialContext.sourceAction || 'ask-about-story' };
    }
    if (normalized.projectContext) {
      const { data: project, error: projectError } = await admin.from('projects').select('id,title,slug,category,status,project_creatives(creative_member_id,role,contribution_role,credit_roles,creative_members(name,slug))').eq('id', normalized.projectContext.id).eq('slug', normalized.projectContext.slug).eq('status', 'published').maybeSingle();
      if (projectError) return fail('PROJECT_CONTEXT_UNAVAILABLE', 'This project context could not be verified. Start a general inquiry instead.', 503, cors);
      if (!project) return fail('PROJECT_CONTEXT_INVALID', 'The linked project is no longer publicly available.', 400, cors);
      const projectBranch = branchKey({ name: project.category });
      if (projectBranch && normalized.branch !== projectBranch) return fail('PROJECT_CONTEXT_INVALID', 'The linked project branch could not be verified.', 400, cors);
      payload.request_metadata = { ...payload.request_metadata, project_id: project.id, project_slug: project.slug, project_title: project.title, project_public_path: `/projects/${encodeURIComponent(project.slug)}`, project_branch: projectBranch || normalized.branch, project_contributors: (project.project_creatives || []).slice(0, 24).map((credit: any) => ({ creative_slug: credit.creative_members?.slug || '', creative_name: credit.creative_members?.name || '', roles: Array.isArray(credit.credit_roles) && credit.credit_roles.length ? credit.credit_roles.slice(0, 12) : [credit.role || credit.contribution_role].filter(Boolean) })), source_action: normalized.projectContext.sourceAction || 'project-detail-inquiry' };
    }
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
