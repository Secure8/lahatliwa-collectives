import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assignmentDeliveryStatus, canPermanentlyDeleteInquiry, constantTimeTextMatch } from './inquiryWorkflow.js';

const jsonHeaders = { 'Content-Type': 'application/json' };
const reply = (body: unknown, status = 200, cors = {}) => new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...cors } });
const fail = (code: string, message: string, status: number, cors = {}) => reply({ success: false, code, message }, status, cors);
const clean = (value: unknown, max = 500) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeHtml = (value: unknown) => String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);

function corsHeaders(req: Request, siteUrl: string) {
  const origin = req.headers.get('Origin') || '';
  const allowed = new Set([siteUrl.replace(/\/$/, ''), 'http://localhost:5173', 'http://127.0.0.1:5173']);
  return {
    ...(allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

async function sendEmail(apiKey: string, payload: any) {
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
}

async function resolveNotificationEmail(admin: any, member: any) {
  const { data: preference, error: preferenceError } = await admin.from('creative_notification_preferences').select('notification_email').eq('creative_member_id', member.creative_member_id).maybeSingle();
  if (preferenceError) throw preferenceError;
  const preferenceEmail = clean(preference?.notification_email, 254).toLowerCase();
  if (preferenceEmail) return validEmail(preferenceEmail) ? preferenceEmail : '';
  const accountEmail = clean(member.email, 254).toLowerCase();
  return validEmail(accountEmail) ? accountEmail : '';
}

async function recordAttempt(admin: any, inquiryId: string, deliveryKey: string, memberId: string | null, kind: string, status: string, errorMessage = '') {
  const { data: existing } = await admin.from('inquiry_delivery_attempts').select('attempts').eq('inquiry_id', inquiryId).eq('delivery_key', deliveryKey).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await admin.from('inquiry_delivery_attempts').upsert({
    inquiry_id: inquiryId,
    delivery_key: deliveryKey,
    recipient_member_id: memberId,
    recipient_kind: kind,
    status,
    attempts: Number(existing?.attempts || 0) + 1,
    last_error: status === 'failed' ? clean(errorMessage || 'Delivery failed.', 300) : null,
    last_attempted_at: now,
    sent_at: status === 'sent' ? now : null,
    updated_at: now,
  }, { onConflict: 'inquiry_id,delivery_key' });
  if (error) throw error;
}

Deno.serve(async (req) => {
  const configuredSiteUrl = Deno.env.get('PUBLIC_SITE_URL') || '';
  let siteUrl = '';
  try { siteUrl = new URL(configuredSiteUrl).origin; } catch { siteUrl = ''; }
  const cors = corsHeaders(req, siteUrl);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!siteUrl || !cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const expectedPin = Deno.env.get('SUPER_ADMIN_MEMBER_ACTIONS_PIN') || '';
  const emailConfig = {
    apiKey: Deno.env.get('RESEND_API_KEY') || '',
    fromEmail: Deno.env.get('INQUIRY_FROM_EMAIL') || '',
    adminEmail: Deno.env.get('INQUIRY_ADMIN_EMAIL') || 'lahatliwa.collectives@gmail.com',
  };
  const authorization = req.headers.get('Authorization');
  if (!url || !anonKey || !serviceKey || !authorization) return fail('INVALID_SESSION', 'Your session has expired. Please sign in again.', 401, cors);

  try {
    const body = await req.json();
    const action = clean(body.action, 50);
    const inquiryId = clean(body.inquiryId, 80);
    if (!inquiryId) return fail('INQUIRY_NOT_FOUND', 'The inquiry could not be found.', 404, cors);

    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return fail('INVALID_SESSION', 'Your session has expired. Please sign in again.', 401, cors);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: caller, error: callerError } = await admin.from('admin_users').select('id, role, status').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (callerError || !caller) return fail('NOT_AUTHORIZED', 'Only an active Team member may perform this action.', 403, cors);
    const { data: inquiry, error: inquiryError } = await admin.from('project_inquiries').select('id, public_reference, name, client_email, summary, details, workflow_status, current_assignee_id').eq('id', inquiryId).maybeSingle();
    if (inquiryError || !inquiry) return fail('INQUIRY_NOT_FOUND', 'The inquiry could not be found.', 404, cors);

    if (action === 'permanent_delete') {
      if (!canPermanentlyDeleteInquiry(caller.role, inquiry.workflow_status, body.confirmation)) return fail('DELETE_NOT_ALLOWED', 'Only a completed or closed inquiry can be permanently deleted by the Super Admin.', 409, cors);
      if (!expectedPin || !constantTimeTextMatch(body.pin, expectedPin)) return fail('INVALID_PIN', 'Invalid PIN.', 403, cors);
      const { data, error } = await admin.rpc('execute_super_admin_inquiry_delete', { p_inquiry_id: inquiry.id, p_actor_user_id: user.id });
      if (error) {
        console.error('[inquiry-workflow] permanent delete failed', { inquiryId, code: error.code, message: error.message });
        return fail('DELETE_FAILED', 'The inquiry and its workflow records could not be permanently deleted.', 500, cors);
      }
      return reply({ success: true, result: data }, 200, cors);
    }

    if (!['notify_assignment', 'retry_assignment_notification'].includes(action)) return fail('INVALID_ACTION', 'The requested inquiry action is invalid.', 400, cors);
    if (action === 'retry_assignment_notification' && !['super_admin', 'owner'].includes(caller.role)) return fail('NOT_SUPER_ADMIN', 'Only the Super Admin may retry delivery.', 403, cors);
    const { data: assignment, error: assignmentError } = await admin.from('inquiry_assignments').select('id, assigned_member_id, assigned_by, status').eq('inquiry_id', inquiry.id).is('ended_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (assignmentError || !assignment) return fail('ASSIGNMENT_NOT_FOUND', 'The current assignment could not be found.', 404, cors);
    if (!['super_admin', 'owner'].includes(caller.role) && assignment.assigned_by !== caller.id) return fail('NOT_AUTHORIZED', 'You cannot send this assignment notification.', 403, cors);
    const deliveryKey = `transfer:${assignment.id}`;
    const { data: prior } = await admin.from('inquiry_delivery_attempts').select('status').eq('inquiry_id', inquiry.id).eq('delivery_key', deliveryKey).maybeSingle();
    if (prior?.status === 'sent') return reply({ success: true, notificationStatus: 'sent', duplicate: true }, 200, cors);
    if (!emailConfig.apiKey || !emailConfig.fromEmail) return fail('EMAIL_NOT_CONFIGURED', 'Email delivery is not configured.', 503, cors);

    const { data: recipient, error: recipientError } = await admin.from('admin_users').select('id, email, display_name, creative_member_id, status').eq('id', assignment.assigned_member_id).eq('status', 'active').not('creative_member_id', 'is', null).maybeSingle();
    if (recipientError || !recipient) return fail('RECIPIENT_UNAVAILABLE', 'The receiving creative is no longer available.', 409, cors);
    let directStatus = 'failed';
    let fallbackStatus = '';
    let directError = '';
    let notificationEmail = '';
    try { notificationEmail = await resolveNotificationEmail(admin, recipient); } catch { directError = 'Notification address could not be resolved.'; }
    const html = `<!doctype html><html><body style="background:#09090b;color:#f4f4f5;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:32px 20px"><h1>An inquiry was assigned to you</h1><p><strong>${escapeHtml(inquiry.public_reference)}</strong></p><p>${escapeHtml(inquiry.summary)}</p><p style="white-space:pre-wrap">${escapeHtml(inquiry.details)}</p><p><a style="color:#fdba74" href="${escapeHtml(`${siteUrl}/admin/inquiries?reference=${encodeURIComponent(inquiry.public_reference)}`)}">Open the Team inquiry workspace</a></p></div></body></html>`;
    if (notificationEmail) {
      try {
        await sendEmail(emailConfig.apiKey, { from: emailConfig.fromEmail, to: [notificationEmail], reply_to: inquiry.client_email, subject: `Inquiry assigned to you — ${inquiry.public_reference}`, html });
        directStatus = 'sent';
      } catch (error) { directError = error instanceof Error ? error.message : 'Delivery failed.'; }
    }
    await recordAttempt(admin, inquiry.id, deliveryKey, recipient.id, 'transfer', directStatus, directError || 'No valid notification email.');
    if (directStatus !== 'sent') {
      try {
        await sendEmail(emailConfig.apiKey, { from: emailConfig.fromEmail, to: [emailConfig.adminEmail], reply_to: inquiry.client_email, subject: `Assignment delivery fallback — ${inquiry.public_reference}`, html });
        fallbackStatus = 'sent';
      } catch { fallbackStatus = 'failed'; }
      await recordAttempt(admin, inquiry.id, `${deliveryKey}:fallback`, null, 'fallback', fallbackStatus, 'Fallback delivery failed.');
    }
    return reply({ success: true, notificationStatus: assignmentDeliveryStatus(directStatus, fallbackStatus) }, 200, cors);
  } catch (error) {
    console.error('[inquiry-workflow] request failed', { code: (error as any)?.code || 'UNEXPECTED_ERROR' });
    return fail('WORKFLOW_FAILED', 'The inquiry action could not be completed.', 500, cors);
  }
});
