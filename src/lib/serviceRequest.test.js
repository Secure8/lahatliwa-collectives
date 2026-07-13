import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { branchKeyFromRecord, emptyInquiryDraft, inquiryUrl, mergeInquiryContext, referenceIsValid, safeInquiryDraft, slugifyService, validateInquiryStep } from './serviceRequest.js';

test('canonical branch and inquiry routes preserve refresh-safe context', () => {
  assert.equal(branchKeyFromRecord({ slug: 'lahat-liwa-studio' }), 'studio');
  assert.equal(branchKeyFromRecord({ name: 'Lahat Liwa Web' }), 'digital');
  assert.equal(inquiryUrl({ branch: 'studio', service: 'Photo Editing', creative: 'Jane-Doe' }), '/inquiry?branch=studio&service=photo-editing&creative=jane-doe');
  assert.equal(inquiryUrl({ branch: 'invalid', service: 'Photography' }), '/inquiry?service=photography');
});

test('draft context persists valid fields and rejects invalid branch state', () => {
  const draft = mergeInquiryContext(emptyInquiryDraft(), { branch: 'tech', service: 'Virtual Assistance', creative: 'alex' });
  const restored = safeInquiryDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(restored.branch, 'tech');
  assert.equal(restored.serviceKey, 'virtual-assistance');
  assert.equal(restored.creativeSlug, 'alex');
  assert.equal(safeInquiryDraft({ ...draft, branch: 'invalid' }).branch, '');
});

test('branch-specific and common client validation fails safely', () => {
  const draft = emptyInquiryDraft({ branch: 'digital', service: 'Website Development' });
  assert.deepEqual(validateInquiryStep(0, draft, [{ key: 'website-development' }]), {});
  assert.ok(validateInquiryStep(0, { ...draft, serviceKey: 'made-up' }, [{ key: 'website-development' }]).serviceKey);
  assert.ok(validateInquiryStep(1, { ...draft, creativeSlug: 'missing' }, []).creativeSlug);
  assert.ok(validateInquiryStep(2, { ...draft, summary: 'Hi', details: 'short' }).summary);
  assert.ok(validateInquiryStep(3, { ...draft, clientName: 'A', clientEmail: 'bad', consent: false }).clientEmail);
});

test('public reference format is strict and non-database-identifying', () => {
  assert.equal(referenceIsValid('LLC-2026-AB12CD'), true);
  assert.equal(referenceIsValid('1'), false);
  assert.equal(slugifyService('UI & Prototype'), 'ui-and-prototype');
});

test('router and CTA sources use the shared inquiry system', async () => {
  const [app, hero, profile, services] = await Promise.all([
    readFile(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/CreativeProfileView.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
  ]);
  for (const route of ['/services/:branch', '/inquiry', '/inquiry/confirmation/:reference']) assert.match(app, new RegExp(route.replace(/[/:]/g, '\\$&')));
  assert.match(hero, /inquiryUrl\(\{ creative: creative\.slug \}\)/);
  assert.match(profile, /inquiryUrl\(\{ creative: creative\.slug \}\)/);
  assert.doesNotMatch(`${hero}\n${profile}\n${services}`, /href="#"/);
});

test('guided form keeps mobile controls bounded and includes the Tech safety warning', async () => {
  const source = await readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8');
  assert.match(source, /Never submit passwords, one-time codes, banking details/);
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /min-w-screen|w-screen/);
});

test('migration closes public reads and inserts while limiting creative access to direct assignment', async () => {
  const sql = await readFile(new URL('../../supabase/service_request_portal.sql', import.meta.url), 'utf8');
  assert.match(sql, /revoke insert, delete on public\.project_inquiries from anon, authenticated/i);
  assert.match(sql, /revoke select, update on public\.project_inquiries from anon/i);
  assert.match(sql, /coalesce\(assigned_creative_id, preferred_creative_id\) = private\.current_creative_member_id\(\)/i);
  assert.match(sql, /private\.has_role\(auth\.uid\(\), array\['super_admin', 'owner', 'admin'\]\)/i);
  assert.doesNotMatch(sql, /create policy "Public can submit valid project inquiries"/i);
});

test('public creative collector excludes private notification email fields', async () => {
  const sql = await readFile(new URL('../../supabase/service_request_portal.sql', import.meta.url), 'utf8');
  const rpc = sql.slice(sql.indexOf('create or replace function public.list_eligible_inquiry_creatives'), sql.indexOf('revoke all on function public.list_eligible_inquiry_creatives'));
  assert.match(rpc, /id uuid, name text, slug text, role text, profile_image_url text/);
  assert.doesNotMatch(rpc, /notification_email|admin_users\.email/i);
});

test('server saves and de-duplicates before attempting notification delivery', async () => {
  const edge = await readFile(new URL('../../supabase/functions/submit-service-request/index.ts', import.meta.url), 'utf8');
  const duplicateCheck = edge.indexOf(".eq('idempotency_key', normalized.idempotencyKey)");
  const insert = edge.indexOf(".insert(payload)");
  const addressResolution = edge.indexOf('resolveCreativeNotificationEmail(admin, creative.id)', insert);
  const delivery = edge.indexOf('deliverNotifications(admin, inquiry, deliveryCreative, emailConfig)', insert);
  assert.ok(duplicateCheck > -1 && duplicateCheck < insert);
  assert.ok(insert > -1 && insert < addressResolution);
  assert.ok(insert > -1 && insert < delivery);
  assert.match(edge, /notification_status: 'failed'.*Email delivery is not configured\./s);
});

test('creative inquiries remain assigned, unread, and visible to authorized dashboard users', async () => {
  const [edge, sql] = await Promise.all([
    readFile(new URL('../../supabase/functions/submit-service-request/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/service_request_portal.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(edge, /preferred_creative_id: creative\?\.id \|\| null/);
  assert.match(edge, /assigned_creative_id: creative\?\.id \|\| null/);
  assert.match(edge, /notification_status: 'pending', notification_state: \{\}, unread: true/);
  assert.match(sql, /private\.has_role\(auth\.uid\(\), array\['super_admin', 'owner', 'admin'\]\)/i);
  assert.match(sql, /coalesce\(assigned_creative_id, preferred_creative_id\) = private\.current_creative_member_id\(\)/i);
});
