import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { defaultSiteContent } from '../data/siteContent.js';
import { branchKeyFromRecord, branchMeta, buildInquirySubmissionRequest, canonicalServiceKey, changeInquiryBranchSelection, emptyInquiryDraft, INQUIRY_DETAILS_STEP, INQUIRY_SELECTION_STEP, INQUIRY_SPECIALIST_STEP, inquiryCopy, inquiryNavigationState, inquiryUrl, mergeInquiryContext, publicBranchDescription, referenceIsValid, resolveInquiryEntry, safeInquiryDraft, serviceCategoriesForBranch, slugifyService, validateInquiryStep } from './serviceRequest.js';

test('canonical branch and inquiry routes preserve refresh-safe context', () => {
  assert.equal(branchKeyFromRecord({ slug: 'lahat-liwa-studio' }), 'studio');
  assert.equal(branchKeyFromRecord({ name: 'Lahat Liwa Web' }), 'digital');
  assert.equal(inquiryUrl({ branch: 'studio', service: 'Photo Editing', creative: 'Jane-Doe' }), '/inquiry?branch=studio&service=editing&creative=jane-doe');
  assert.equal(inquiryUrl({ branch: 'invalid', service: 'Photography' }), '/inquiry?service=photography');
});

test('inquiry entry routing advances only through selections explicitly provided', () => {
  const published = ['studio', 'tech', 'digital', 'social'];
  const creatives = [{ id: 'creative-id', slug: 'alex-tech' }];
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech', service: 'setup' }, published, creatives), { branch: 'tech', serviceKey: 'setup', creativeSlug: '', step: INQUIRY_SPECIALIST_STEP, status: 'specialist' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech', service: 'setup', creative: 'alex-tech' }, published, creatives), { branch: 'tech', serviceKey: 'setup', creativeSlug: 'alex-tech', step: INQUIRY_DETAILS_STEP, status: 'ready-specialist' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech', service: 'setup', creative: 'missing-specialist' }, published, creatives), { branch: 'tech', serviceKey: 'setup', creativeSlug: '', step: INQUIRY_SPECIALIST_STEP, status: 'invalid-specialist' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech', service: 'setup', creative: 'general-team' }, published, creatives), { branch: 'tech', serviceKey: 'setup', creativeSlug: '', step: INQUIRY_DETAILS_STEP, status: 'ready-team' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech' }, published, creatives), { branch: 'tech', serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'branch-only' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech', service: 'device-setup' }, published, creatives), { branch: 'tech', serviceKey: 'setup', creativeSlug: '', step: INQUIRY_SPECIALIST_STEP, status: 'specialist' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'tech', service: 'unavailable-service' }, published, creatives), { branch: 'tech', serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'invalid-service' });
  assert.deepEqual(resolveInquiryEntry({}, published, creatives), { branch: '', serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'direct' });
  assert.deepEqual(resolveInquiryEntry({ branch: 'studio', service: 'photo' }, ['tech'], creatives), { branch: '', serviceKey: '', creativeSlug: '', step: INQUIRY_SELECTION_STEP, status: 'invalid-branch' });
  assert.deepEqual(inquiryNavigationState({ branch: 'tech', service: 'Device Setup' }), { inquirySelection: { branch: 'tech', service: 'setup' } });
});

test('draft context persists valid fields and rejects invalid branch state', () => {
  const draft = mergeInquiryContext(emptyInquiryDraft(), { branch: 'tech', service: 'Virtual Assistance', creative: 'alex' });
  const restored = safeInquiryDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(restored.branch, 'tech');
  assert.equal(restored.serviceKey, 'remote-assistance');
  assert.equal(restored.creativeSlug, 'alex');
  assert.equal(safeInquiryDraft({ ...draft, branch: 'invalid' }).branch, '');
});

test('changing branches clears branch-specific answers but preserves shared client information', () => {
  const changed = changeInquiryBranchSelection({
    branch: 'studio', serviceKey: 'photo', creativeSlug: 'studio-member', summary: 'Old shoot', details: 'Old visual request details',
    serviceMode: 'On location', branchDetails: { eventType: 'Portrait' }, clientName: 'Client', clientEmail: 'client@example.com',
    organization: 'Organization', preferredSchedule: 'Next month', generalLocation: 'Manila', budgetRange: 'Not specified', consent: true,
  }, 'tech');
  assert.deepEqual({ branch: changed.branch, serviceKey: changed.serviceKey, creativeSlug: changed.creativeSlug, summary: changed.summary, details: changed.details, serviceMode: changed.serviceMode, branchDetails: changed.branchDetails }, { branch: 'tech', serviceKey: '', creativeSlug: '', summary: '', details: '', serviceMode: '', branchDetails: {} });
  assert.deepEqual({ clientName: changed.clientName, clientEmail: changed.clientEmail, organization: changed.organization, preferredSchedule: changed.preferredSchedule, generalLocation: changed.generalLocation, budgetRange: changed.budgetRange, consent: changed.consent }, { clientName: 'Client', clientEmail: 'client@example.com', organization: 'Organization', preferredSchedule: 'Next month', generalLocation: 'Manila', budgetRange: 'Not specified', consent: true });
});

test('submission boundary sends only canonical service keys', () => {
  const expected = {
    studio: ['photo', 'video', 'same-day-edit', 'highlights', 'editing', 'other-creative-work'],
    tech: ['diagnostics', 'setup', 'remote-assistance', 'on-site-support', 'maintenance-and-optimization', 'consultation'],
    digital: ['website', 'app', 'design-and-prototype', 'system', 'maintenance-and-improvements', 'consultation'],
    social: ['management', 'content', 'digital-marketing', 'campaign', 'page-setup', 'review-and-consultation'],
  };
  for (const [branch, keys] of Object.entries(expected)) {
    assert.deepEqual(serviceCategoriesForBranch(branch).map((service) => service.key), keys);
    for (const service of serviceCategoriesForBranch(branch)) {
      assert.equal(buildInquirySubmissionRequest({ branch, serviceKey: service.key }).serviceKey, service.key);
      assert.equal(buildInquirySubmissionRequest({ branch, serviceKey: service.name }).serviceKey, service.key);
    }
  }
  assert.equal(buildInquirySubmissionRequest({ branch: 'digital', serviceKey: 'digital-product' }).serviceKey, 'maintenance-and-improvements');
  assert.equal(buildInquirySubmissionRequest({ branch: 'social', serviceKey: 'strategy' }).serviceKey, 'digital-marketing');
  assert.equal(buildInquirySubmissionRequest({ branch: 'tech', serviceKey: 'other-technical-help' }).serviceKey, 'maintenance-and-optimization');
  assert.equal(buildInquirySubmissionRequest({ branch: 'studio', serviceKey: 'unlisted-service' }).serviceKey, '');
});

test('branch-specific and common client validation fails safely', () => {
  const draft = emptyInquiryDraft({ branch: 'digital', service: 'Website Development' });
  assert.deepEqual(validateInquiryStep(0, draft, [{ key: 'website' }]), {});
  assert.deepEqual(validateInquiryStep(INQUIRY_SPECIALIST_STEP, { ...draft, creativeSlug: '' }, [], []), {});
  assert.ok(validateInquiryStep(0, { ...draft, serviceKey: 'made-up' }, [{ key: 'website' }]).serviceKey);
  assert.ok(validateInquiryStep(1, { ...draft, creativeSlug: 'missing' }, []).creativeSlug);
  assert.ok(validateInquiryStep(2, { ...draft, summary: 'Hi', details: 'short' }).summary);
  assert.deepEqual(validateInquiryStep(2, { ...draft, branch: 'tech', summary: 'Technical help', details: 'Please review this technical workflow issue.', branchDetails: {} }), {});
  assert.ok(validateInquiryStep(3, { ...draft, clientName: 'A', clientEmail: 'bad', consent: false }).clientEmail);
  for (const branch of ['studio', 'digital', 'social', 'tech', 'general']) {
    const branchDraft = { ...emptyInquiryDraft({ branch }), summary: '', details: '' };
    const errors = validateInquiryStep(2, branchDraft);
    assert.equal(errors.summary, inquiryCopy(branch).summaryError);
    assert.equal(errors.details, inquiryCopy(branch).detailsError);
  }
});

test('every inquiry branch exposes distinct labels, examples, roles, and follow-up language', () => {
  const expected = {
    studio: ['Tell us about the shoot or visual project', 'Shoot or production summary', 'What visual output do you need?', 'Creative or production specialist', 'Shoot date, event date, or turnaround'],
    digital: ['Tell us about the digital product or system', 'Product or system summary', 'What should the product or system accomplish?', 'Developer or digital specialist', 'Preferred timeline or launch target'],
    social: ['Tell us about your brand or campaign', 'Marketing or social media summary', 'What kind of marketing support do you need?', 'Social media or marketing specialist', 'Campaign dates or preferred start'],
    tech: ['Tell us about the device or technical issue', 'Technical request summary', 'What problem or setup do you need help with?', 'Technician or technical specialist', 'When do you need technical support?'],
    general: ['Tell us what you need', 'Request summary', 'Describe your request', 'Liwa team member', 'Preferred date or timeline'],
  };
  for (const [branch, [sectionTitle, summaryLabel, detailsLabel, recipientLabel, scheduleLabel]] of Object.entries(expected)) {
    const copy = inquiryCopy(branch);
    assert.equal(copy.steps[2], sectionTitle);
    assert.equal(copy.summaryLabel, summaryLabel);
    assert.equal(copy.detailsLabel, detailsLabel);
    assert.equal(copy.recipientLabel, recipientLabel);
    assert.equal(copy.scheduleLabel, scheduleLabel);
    assert.ok(copy.summaryHelper.length > 20);
    assert.ok(copy.detailsHelper.length > 40);
    if (branch !== 'general') {
      assert.equal(copy.examples.length, 2);
      assert.ok(copy.reviewFields.length >= 3);
    }
  }
  assert.equal(inquiryCopy(''), inquiryCopy('general'));
  assert.equal(new Set(Object.values(expected).map(([title]) => title)).size, 5);
  assert.doesNotMatch(`${inquiryCopy('tech').pageDescription} ${inquiryCopy('tech').matchingCopy}`, /creative project|match.*creative/i);
});

test('every branch owns exact service-selection heading and supporting description copy', async () => {
  const expected = {
    studio: ['Choose the visual service you need.', 'For shoots, event coverage, editing, highlights, and other visual work.'],
    digital: ['Choose the digital service you need.', 'For websites, applications, systems, prototypes, maintenance, and development guidance.'],
    social: ['Choose the marketing support you need.', 'For social media management, content planning, campaigns, branding, and audience growth.'],
    tech: ['Choose the technical support you need.', 'For computer troubleshooting, device setup, software assistance, system support, and maintenance.'],
    general: ['Choose the type of support you need.', 'For requests that may involve one or more Liwa branches, consultation, or general assistance.'],
  };

  for (const [branch, [heading, description]] of Object.entries(expected)) {
    const copy = inquiryCopy(branch);
    assert.equal(copy.serviceSelectionHeading, heading);
    assert.equal(copy.serviceSelectionDescription, description);
  }

  const [form, services, confirmation] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/InquiryConfirmation.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(form, /legend=\{copy\.serviceSelectionHeading\}/);
  assert.match(form, /copy\.serviceSelectionDescription/);
  assert.match(services, /copy\.serviceSelectionHeading/);
  assert.match(services, /copy\.serviceSelectionDescription/);
  assert.match(confirmation, /copy\.serviceSelectionHeading/);
  assert.match(confirmation, /copy\.serviceSelectionDescription/);
  assert.doesNotMatch(`${form}\n${services}\n${confirmation}`, /Choose a broad category for your request|For building your online presence/i);
  assert.doesNotMatch(`${inquiryCopy('studio').serviceSelectionDescription} ${inquiryCopy('tech').serviceSelectionDescription}`, /online presence|creative project/i);
});

test('every branch exposes exactly six balanced services while legacy URLs remain compatible', () => {
  const expected = {
    studio: ['Photography', 'Videography', 'Same-Day Edit (SDE)', 'Highlights', 'Photo & Video Editing', 'Other Visual Work'],
    tech: ['Computer Troubleshooting', 'Device Setup', 'Software Assistance', 'System & Network Support', 'Maintenance & Optimization', 'Technical Consultation'],
    digital: ['Website Development', 'Application Development', 'UI & Prototyping', 'Digital Systems', 'Maintenance & Improvements', 'Technical Consultation'],
    social: ['Social Media Management', 'Content Planning', 'Digital Marketing', 'Campaign Support', 'Branding & Page Support', 'Marketing Consultation'],
    general: ['General Service Request', 'Multi-Branch Request', 'Partnership & Collaboration', 'Event or Organization Support', 'Consultation & Planning', 'Not Sure Yet'],
  };
  for (const [branch, names] of Object.entries(expected)) {
    const categories = serviceCategoriesForBranch(branch);
    assert.equal(categories.length, 6);
    assert.deepEqual(categories.map((item) => item.name), names);
    for (const category of categories) {
      assert.equal(inquiryUrl({ branch, service: category.key }), `/inquiry?branch=${branch}&service=${category.key}`);
    }
  }
  for (const group of defaultSiteContent.services) {
    const branch = branchKeyFromRecord(group);
    assert.equal(group.items.length, 6);
    assert.deepEqual(group.items, expected[branch]);
  }
  assert.equal(canonicalServiceKey('studio', 'portrait-photography'), 'photo');
  assert.equal(canonicalServiceKey('digital', 'landing-pages'), 'website');
  assert.equal(canonicalServiceKey('social', 'digital-marketing-support'), 'digital-marketing');
  assert.equal(canonicalServiceKey('tech', 'virtual-assistance'), 'remote-assistance');
  assert.equal(canonicalServiceKey('digital', 'digital-product'), 'maintenance-and-improvements');
  assert.equal(canonicalServiceKey('social', 'strategy'), 'digital-marketing');
  assert.equal(canonicalServiceKey('tech', 'other-technical-help'), 'maintenance-and-optimization');
  assert.deepEqual(serviceCategoriesForBranch('studio', ['Photography', 'Photo Editing', 'Audio Production']), serviceCategoriesForBranch('studio'));
});

test('branch descriptions are specific, stable, and replace known template copy without hiding intentional CMS wording', () => {
  assert.match(branchMeta('studio').description, /shoot, coverage, production, or editing request/);
  assert.match(branchMeta('tech').description, /technician or technical specialist/);
  assert.match(branchMeta('digital').description, /developer or digital specialist/);
  assert.match(branchMeta('social').description, /social media or marketing specialist/);
  assert.match(branchMeta('general').description, /appropriate Liwa branch/);
  assert.equal(publicBranchDescription('social', 'Start a guided Liwa Social request and describe the exact outcome.'), branchMeta('social').description);
  assert.equal(publicBranchDescription('studio', 'Custom audio and mixed-media support for community productions.'), 'Custom audio and mixed-media support for community productions.');
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
  assert.match(source, /const copy = inquiryCopy\(draft\.branch\)/);
  assert.match(source, /<DetailsStep[^>]+copy=\{copy\}/);
  assert.match(source, /<ContactStep[^>]+copy=\{copy\}/);
  assert.match(source, /function selectBranch[\s\S]*changeInquiryBranchSelection\(current, branch\)/);
  assert.match(source, /function selectBranch[\s\S]*setErrors\(\{\}\)/);
  assert.match(source, /request: buildInquirySubmissionRequest\(draft\)/);
});

test('services preselection skips safely and exposes an accessible change-selection path', async () => {
  const [form, services] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(services, /state=\{inquiryNavigationState\(\{ branch: branch\.key, service: service\.key \}\)\}/);
  assert.match(form, /const navigationSelection = location\.state\?\.inquirySelection/);
  assert.match(form, /entry\.status === 'specialist'[\s\S]*moveToStep\(entry\.step\)/);
  assert.match(form, /function changeSelection\(\)[\s\S]*delete nextState\.inquirySelection[\s\S]*moveToStep\(INQUIRY_SELECTION_STEP\)[\s\S]*replace: true/);
  assert.match(form, /function changeSpecialist\(\)[\s\S]*delete nextState\.inquirySelection\.creative[\s\S]*moveToStep\(INQUIRY_SPECIALIST_STEP\)[\s\S]*replace: true/);
  assert.match(form, /<SelectionSummary[\s\S]*?onChange=\{changeSelection\}/);
  assert.match(form, /onChangeSpecialist=\{step > INQUIRY_SPECIALIST_STEP \? changeSpecialist : null\}/);
  assert.match(form, /Preferred specialist:/);
  assert.match(form, /aria-live="polite" aria-atomic="true"/);
  assert.match(form, /ref=\{stepHeadingRef\} tabIndex="-1"/);
});

test('inquiry copy requires a prominent detailed request and avoids instant-booking promises', async () => {
  const [form, services, confirmation, email] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/InquiryConfirmation.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../supabase/functions/submit-service-request/index.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(form, /label=\{copy\.detailsLabel\}/);
  assert.match(form, /\{copy\.matchingCopy\}/);
  assert.match(confirmation, /inquiryCopy\(branchKey\)/);
  assert.match(email, /Service category.*inquiry\.project_type/s);
  assert.match(email, /Request details.*inquiry\.details/s);
  assert.doesNotMatch(`${form}\n${services}\n${confirmation}`, /Book now|Confirm booking|Order service|Purchase service|Book a Creative/i);
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
