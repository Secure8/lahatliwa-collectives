import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { branchesFromWebsiteContent, contrastRatio, liveWebsiteFieldValue, resolveWebsiteOverride, safeWebsiteValue, servicesFromWebsiteContent, validateWebsiteEntry, WEBSITE_STUDIO_SECTIONS, websiteBundleToContent, websiteEntryState, websiteImpact } from './websiteStudio.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function bundle(serviceName = 'Website Development') {
  return {
    'global.brand': { brandName: 'Lahat Liwa Collectives', branchName: 'Liwa Digital', tagline: 'Build your presence. Shape your story.' },
    'global.navigation': { homeLabel: 'Home', servicesLabel: 'Services', showServices: true },
    'global.footer': { contextLabel: 'Website by Liwa Digital', footerText: 'Connected public website.' },
    'global.appearance': { primaryTextColor: '#f5f5f4', secondaryTextColor: '#d4d4d8', accentColor: '#f6d58b' },
    'page.services': { title: 'Services', intro: 'Choose the right service.' },
    'page.projects': { title: 'Projects only' },
    'branch.digital': { key: 'digital', name: 'Liwa Digital', status: 'active', displayOrder: 1 },
    'service.digital.website': { key: 'website', branchKey: 'digital', name: serviceName, status: 'active', publicVisibility: true, inquiryAvailability: true, displayOrder: 1 },
  };
}

test('global brand is canonical while Liwa Digital remains a branch', () => {
  const content = websiteBundleToContent(bundle());
  assert.equal(content.displayName, 'Lahat Liwa Collectives');
  assert.equal(content.legalName, 'Lahat Liwa Collectives');
  assert.equal(content.branchName, 'Liwa Digital');
  assert.equal(content.websiteBranches[0].name, 'Liwa Digital');
  assert.notEqual(content.displayName, content.branchName);
});

test('the approved Liwa Explore identity is normalized without rewriting legacy branch records', () => {
  const migration = read('supabase/migrations/20260722213000_website_studio_canonical_branch_identity.sql');
  assert.match(migration, /entry_key = 'branch\.tech'/);
  assert.match(migration, /Liwa Tech', 'Liwa Discovery'/);
  assert.match(migration, /Liwa Explore/);
  assert.match(migration, /website_studio_revisions/);
  assert.doesNotMatch(migration, /update public\.service_branches/i);
});

test('one Service name propagates to the public catalog and inquiry choices', () => {
  const changed = websiteBundleToContent(bundle('Web Design & Development'));
  assert.equal(servicesFromWebsiteContent(changed, 'digital')[0].name, 'Web Design & Development');
  assert.equal(branchesFromWebsiteContent(changed)[0].included_services[0].name, 'Web Design & Development');
});

test('branch changes propagate while page-specific data remains separate', () => {
  const source = bundle();
  source['branch.digital'].name = 'Liwa Digital Branch';
  source['page.projects'].title = 'Selected public work';
  const content = websiteBundleToContent(source);
  assert.equal(content.websiteBranches[0].name, 'Liwa Digital Branch');
  assert.equal(content.websitePages.projects.title, 'Selected public work');
  assert.equal(content.displayName, 'Lahat Liwa Collectives');
});

test('inactive and unavailable shared records fail closed', () => {
  const source = bundle();
  source['service.digital.website'].status = 'inactive';
  assert.deepEqual(servicesFromWebsiteContent(websiteBundleToContent(source), 'digital'), []);
  source['service.digital.website'].status = 'active';
  source['service.digital.website'].inquiryAvailability = false;
  assert.equal(servicesFromWebsiteContent(websiteBundleToContent(source), 'digital', { inquiryOnly: true }).length, 0);
});

test('explicit overrides are optional and reset to the shared value', () => {
  assert.equal(resolveWebsiteOverride('Shared service name', ''), 'Shared service name');
  assert.equal(resolveWebsiteOverride('Shared service name', 'Page label'), 'Page label');
  assert.equal(resolveWebsiteOverride('Shared service name', null), 'Shared service name');
});

test('draft state, impact summaries, and approved routes are deterministic', () => {
  assert.equal(websiteEntryState({ published_data: {}, draft_data: null }), 'Published');
  assert.equal(websiteEntryState({ published_data: {}, draft_data: { title: 'Draft' } }), 'Unpublished changes');
  assert.ok(websiteImpact('service.digital.website').some((area) => /legacy compatibility/i.test(area)));
  assert.throws(() => safeWebsiteValue('/services/digital', 'route'));
  assert.throws(() => safeWebsiteValue('javascript:alert(1)', 'url'));
  assert.throws(() => safeWebsiteValue('<script>alert(1)</script>'));
});

test('text fields keep trailing spaces while typing but trim on save', () => {
  const studio = read('src/pages/admin/WebsiteStudio.jsx');
  assert.match(studio, /liveWebsiteFieldValue/);
  assert.match(studio, /function keepEditorKeysLocal\(event\) \{ event\.stopPropagation\(\); \}/);
  assert.match(studio, /onKeyDown=\{keepEditorKeysLocal\}/);
  assert.equal(liveWebsiteFieldValue('Studio ', 'text'), 'Studio ');
  assert.equal(safeWebsiteValue(' Studio ', 'text'), 'Studio');
});

test('Website Studio excludes branch and fixed-service records and explains the draft-to-publish path', () => {
  const studio = read('src/pages/admin/WebsiteStudio.jsx');
  const api = read('src/lib/websiteStudio.js');
  assert.doesNotMatch(api, /export const BRANCH_FIELDS/);
  assert.match(studio, /!\['branch', 'service'\]\.includes\(entry\.entry_type\)/);
  assert.match(studio, /Save draft[\s\S]*Publish live/);
  assert.match(studio, /Draft saved\. Publish it to update every connected public page\./);
});

test('appearance validation enforces usable contrast', () => {
  assert.ok(contrastRatio('#f5f5f4', '#0b0b0d') > 4.5);
  assert.throws(() => validateWebsiteEntry({ primaryTextColor: '#202020' }, [['primaryTextColor','Primary','color']]), /contrast/i);
  assert.doesNotThrow(() => validateWebsiteEntry({ primaryTextColor: '#f5f5f4', secondaryTextColor: '#d4d4d8' }, [['primaryTextColor','Primary','color'],['secondaryTextColor','Secondary','color']]));
});

test('Website Studio exposes a beginner single-column editor without a simulated device preview', () => {
  const studio = read('src/pages/admin/WebsiteStudio.jsx');
  for (const text of ['Save draft','Published','Publish live','Discard draft','Preview page','Unpublished changes','Advanced settings','Website editor']) assert.match(studio, new RegExp(text, 'i'));
  assert.match(studio, /function SectionChooser/);
  assert.match(studio, /What would you like to change\?/);
  assert.match(studio, /All website sections/);
  for (const pageGroup of ['Public pages', 'Shared across the website']) assert.match(studio, new RegExp(pageGroup));
  for (const pagePart of ['Logo, brand name, and tagline', 'Creative Feed introduction', 'Active Work introduction']) assert.match(studio, new RegExp(pagePart));
  assert.match(studio, /sm:grid-cols-2/);
  assert.doesNotMatch(studio, /\{items\.length\} services|Service listing and inquiry choice/);
  assert.doesNotMatch(studio, /group\/category|shadow-2xl backdrop-blur-xl/);
  assert.match(studio, /data-search-shell className="mt-5 flex h-11/);
  assert.match(studio, /<Search size=\{15\} className="shrink-0[^\n]+<input type="search"/);
  assert.doesNotMatch(studio, /Search size=\{15\} className="absolute left-3 top-3/);
  assert.doesNotMatch(studio, /function StudioNavigation|function MobileSectionMenu|xl:grid-cols-\[16rem_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(studio, /StudioPreview|Draft preview|deviceWidths|desktop preview|tablet preview|mobile preview/);
  assert.match(studio, /\['super_admin','owner','admin'\]/);
  assert.doesNotMatch(studio, /Published history|Website media|admin\/media\/icons|fetchWebsiteStudioRevisions|restoreWebsiteRevision/);
  assert.match(studio, /UnsavedChangesGuard/);
  assert.match(studio, /setNotice\(''\); setError\(''\); setParams/);
  assert.doesNotMatch(studio, /setDirty\(false\); setNotice\(''\); setError\(''\)/);
  assert.doesNotMatch(studio, /window\.confirm|dangerouslySetInnerHTML|contentEditable/);
});

test('Website Studio presents the requested sections and keeps shared values synchronized', () => {
  const footer = read('src/components/Footer.jsx');
  const navbar = read('src/components/Navbar.jsx');
  assert.deepEqual(WEBSITE_STUDIO_SECTIONS.map(({ label }) => label), ['Overview', 'Branding', 'Navbar', 'Feed', 'About', 'Creatives', 'Contact & Services', 'Privacy Policy', 'Colors']);
  assert.ok(!WEBSITE_STUDIO_SECTIONS.some(({ label }) => ['Footer', 'Search', 'Social links'].includes(label)));
  assert.match(footer, /content\.displayName/);
  assert.match(footer, /content\.tagline/);
  assert.match(footer, /content\.socialLinks/);
  assert.doesNotMatch(footer, /BrandLogo|content\.logoUrl/);
  assert.match(navbar, /'Discover', '\/discover'/);
  assert.doesNotMatch(navbar, /navigation\.servicesLabel|navigation\.projectsLabel|navigation\.currentWorkLabel/);
  assert.doesNotMatch(footer, /footerText|footerContextLabel/);
  const content = websiteBundleToContent({
    'global.brand': { brandName: 'New Shared Brand', tagline: 'One shared tagline' },
    'global.navigation': { privacyLabel: 'Data & Privacy' },
    'page.home': { heroDescription: '{{brandName}} shares current work.' },
    'page.about': { intro: 'Lahat Liwa Collectives documents its work.' },
    'page.inquiries': { contactEmail: 'hello@example.com', facebookUrl: 'https://facebook.com/example' },
  });
  assert.equal(content.websitePages.home.heroDescription, 'New Shared Brand shares current work.');
  assert.equal(content.websitePages.about.intro, 'New Shared Brand documents its work.');
  assert.equal(content.email, 'hello@example.com');
  assert.equal(content.privacyLabel, 'Data & Privacy');
  assert.deepEqual(content.socialLinks, [{ label: 'Facebook', href: 'https://facebook.com/example' }]);
});

test('Website Studio sync migration preserves custom values and adds Privacy and shared Contact data', () => {
  const migration = read('supabase/migrations/20260813150000_website_studio_editor_sync.sql');
  assert.match(migration, /'page\.privacy', 'page'/);
  assert.match(migration, /excluded\.published_data \|\| public\.website_studio_entries\.published_data/);
  assert.match(migration, /Move contact details and social links into Contact/);
  assert.doesNotMatch(migration, /\{\{brandName\}\}/);
  assert.match(migration, /set search_path = pg_catalog/i);
});

test('public join requests replace manual team invitations', () => {
  const layout = read('src/components/admin/AdminLayout.jsx');
  const join = read('src/pages/JoinCreative.jsx');
  const review = read('src/pages/admin/CreativeJoinRequests.jsx');
  const migration = read('supabase/migrations/20260815010000_public_creative_join_requests.sql');
  assert.match(layout, /\['Join requests', '\/admin\/team'/);
  assert.match(join, /submit_creative_join_request/);
  assert.match(review, /approve_request/);
  assert.match(migration, /creative_join_requests/);
  assert.doesNotMatch(layout, /AdminPeopleNav|Add Member/);
});

test('Editorial Studio has a clear protected exit to admin', () => {
  const editorial = read('src/pages/editorial/EditorialStudio.jsx');
  assert.match(editorial, /Back to Admin/);
  assert.match(editorial, /to="\/admin\/editorial"/);
  assert.match(editorial, /UnsavedChangesGuard dirty=\{dirty && !status\.working\}/);
  assert.doesNotMatch(editorial, />Admin controls</);
});

test('legacy editors redirect into Website Studio while operations stay separate', () => {
  const app = read('src/App.jsx');
  const layout = read('src/components/admin/AdminLayout.jsx');
  assert.match(app, /path="\/admin\/website"/);
  assert.match(app, /LegacyWebsiteEditorRedirect/);
  assert.doesNotMatch(app, /\/admin\/service-branches/);
  assert.doesNotMatch(app, /<AdminServiceBranches|<ServiceBranchEditor|<ContentEditor|<SiteSettings/);
  assert.match(layout, /ll-operations-window/);
  assert.doesNotMatch(layout, /\['Website', '\/admin\/website'/);
  assert.doesNotMatch(layout, /lg:w-64|lg:ml-64/);
});

test('public content always revalidates and published actions clear every legacy cache', () => {
  const contentApi = read('src/lib/contentApi.js');
  const api = read('src/lib/websiteStudio.js');
  assert.doesNotMatch(contentApi, /memoryIsFresh|PUBLIC_CONTENT_MEMORY_TTL/);
  assert.match(contentApi, /fetchPublicWebsiteStudio\(\)/);
  assert.match(contentApi, /event\?\.detail\?\.reload/);
  assert.match(api, /WEBSITE_CACHE_KEYS/);
  assert.match(api, /window\.dispatchEvent/);
  assert.match(api, /if \(!row\?\.entry_key \|\| row\.draft_data\)/);
});

test('Services and inquiries use open messages instead of a fixed canonical service list', () => {
  const services = read('src/pages/Services.jsx');
  const inquiry = read('src/pages/StartProject.jsx');
  assert.match(services, /not a predefined category/);
  assert.doesNotMatch(services, /content\.websiteServices|allServiceCategories/);
  assert.match(inquiry, /branch: 'general', serviceKey: 'general-inquiry'/);
  assert.match(inquiry, /Creative inquiry form/);
  assert.doesNotMatch(inquiry, /content\.websiteServices|allServiceCategories|selectService|selectRecipient/);
});

test('page-specific Website Studio copy reaches homepage, Current Work, inquiries, metadata, and social links', () => {
  const home = read('src/pages/Home.jsx');
  const explore = read('src/pages/CurrentWork.jsx');
  const inquiry = read('src/pages/StartProject.jsx');
  const app = read('src/App.jsx');
  assert.match(home, /websitePages\?\.home/);
  assert.match(home, /page\.heroTitle/);
  assert.match(home, /page\.heroDescription/);
  assert.match(explore, /websitePages\?\.explore/);
  assert.match(inquiry, /Connect with a Creative/);
  assert.match(inquiry, /page\.disclaimer/);
  assert.match(app, /openGraphImageUrl/);
  const content = websiteBundleToContent({ 'page.search': { facebookUrl: 'https://facebook.com/lahatliwa', instagramUrl: '' } });
  assert.deepEqual(content.socialLinks, [{ label: 'Facebook', href: 'https://facebook.com/lahatliwa' }]);
});

test('migration keeps drafts private, limits writers, validates content, and audits every action', () => {
  const sql = read('supabase/migrations/20260722210000_connected_website_studio.sql');
  const policyGrant = read('supabase/migrations/20260722214500_fix_website_studio_rls_helper_grant.sql');
  assert.match(sql, /revoke all on public\.website_studio_entries from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_public_website_studio\(\) to anon, authenticated/i);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete).* to anon/i);
  assert.match(sql, /private\.website_studio_can_manage/);
  assert.match(sql, /in \('super_admin','admin'\)/);
  assert.match(sql, /WEBSITE_STUDIO_RESTORE_FORBIDDEN/);
  assert.match(sql, /website_studio_revisions/);
  assert.match(sql, /changed_fields/);
  assert.match(sql, /javascript\\s\*:/);
  assert.match(policyGrant, /grant execute on function private\.website_studio_can_manage\(uuid\) to authenticated/i);
  assert.match(policyGrant, /revoke all on function private\.website_studio_can_manage\(uuid\) from public, anon/i);
  assert.doesNotMatch(policyGrant, /grant execute[\s\S]* to anon/i);
});

test('brand alignment migration and Creatives hero use the current identity', () => {
  const hero = read('src/components/CollectiveHero.jsx');
  const migration = read('supabase/migrations/20260813120000_brand_content_alignment.sql');
  assert.match(hero, /CREATIVE CONTRIBUTORS/);
  assert.match(hero, /People behind the work\./);
  assert.match(migration, /Aklan-based creative work platform/);
  assert.match(migration, /Follow the work while it is happening\./);
});
