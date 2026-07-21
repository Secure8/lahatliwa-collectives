import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { branchesFromWebsiteContent, contrastRatio, resolveWebsiteOverride, safeWebsiteValue, servicesFromWebsiteContent, validateWebsiteEntry, websiteBundleToContent, websiteEntryState, websiteImpact } from './websiteStudio.js';

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
  assert.ok(websiteImpact('service.digital.website').some((area) => /inquiry choices/i.test(area)));
  assert.equal(safeWebsiteValue('/services/digital', 'route'), '/services/digital');
  assert.throws(() => safeWebsiteValue('javascript:alert(1)', 'url'));
  assert.throws(() => safeWebsiteValue('<script>alert(1)</script>'));
});

test('appearance validation enforces usable contrast', () => {
  assert.ok(contrastRatio('#f5f5f4', '#0b0b0d') > 4.5);
  assert.throws(() => validateWebsiteEntry({ primaryTextColor: '#202020' }, [['primaryTextColor','Primary','color']]), /contrast/i);
  assert.doesNotThrow(() => validateWebsiteEntry({ primaryTextColor: '#f5f5f4', secondaryTextColor: '#d4d4d8' }, [['primaryTextColor','Primary','color'],['secondaryTextColor','Secondary','color']]));
});

test('Website Studio exposes beginner preview, draft, publish, discard, revisions, and role controls', () => {
  const studio = read('src/pages/admin/WebsiteStudio.jsx');
  for (const text of ['Save draft','Draft preview','Published','Publish','Discard','View live website','Revisions','Unpublished changes']) assert.match(studio, new RegExp(text, 'i'));
  assert.match(studio, /deviceWidths = \{ desktop: '100%', tablet: '768px', mobile: '390px' \}/);
  assert.match(studio, /aria-label=\{`\$\{key\} preview`\}/);
  assert.match(studio, /\['super_admin','owner','admin'\]/);
  assert.match(studio, /role === 'super_admin'/);
  assert.match(studio, /UnsavedChangesGuard/);
  assert.doesNotMatch(studio, /window\.confirm|dangerouslySetInnerHTML|contentEditable/);
});

test('legacy editors redirect into one Website Studio and admin navigation is grouped', () => {
  const app = read('src/App.jsx');
  const layout = read('src/components/admin/AdminLayout.jsx');
  assert.match(app, /path="\/admin\/website"/);
  assert.match(app, /LegacyWebsiteEditorRedirect/);
  assert.match(app, /\/admin\/website\?section=page\.services/);
  assert.doesNotMatch(app, /<AdminServiceBranches|<ServiceBranchEditor|<ContentEditor|<SiteSettings/);
  assert.match(layout, /\['Content'/);
  assert.match(layout, /Website Studio/);
  assert.doesNotMatch(layout, /\['Website', \[/);
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

test('Services and inquiries read the same canonical records instead of hardcoded display names', () => {
  const services = read('src/pages/Services.jsx');
  const inquiry = read('src/pages/StartProject.jsx');
  assert.match(services, /branchesFromWebsiteContent/);
  assert.match(services, /servicesFromWebsiteContent/);
  assert.match(services, /branch\.name \|\| branch\.label/);
  assert.match(inquiry, /branchesFromWebsiteContent/);
  assert.match(inquiry, /typeof configured\[0\] === 'object'/);
});

test('page-specific Website Studio copy reaches homepage, Explore, inquiries, metadata, and social links', () => {
  const home = read('src/pages/Home.jsx');
  const explore = read('src/pages/tourism/TourismIndex.jsx');
  const inquiry = read('src/pages/StartProject.jsx');
  const app = read('src/App.jsx');
  assert.match(home, /websitePages\?\.home/);
  assert.match(home, /page\.featuredTitle/);
  assert.match(home, /page\.inquiryTitle/);
  assert.match(explore, /websitePages\?\.explore/);
  assert.match(inquiry, /page\.landingHeading/);
  assert.match(inquiry, /page\.disclaimer/);
  assert.match(app, /openGraphImageUrl/);
  const content = websiteBundleToContent({ 'page.search': { facebookUrl: 'https://facebook.com/lahatliwa', instagramUrl: '' } });
  assert.deepEqual(content.socialLinks, [{ label: 'Facebook', href: 'https://facebook.com/lahatliwa' }]);
});

test('migration keeps drafts private, limits writers, validates content, and audits every action', () => {
  const sql = read('supabase/migrations/20260722210000_connected_website_studio.sql');
  assert.match(sql, /revoke all on public\.website_studio_entries from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_public_website_studio\(\) to anon, authenticated/i);
  assert.doesNotMatch(sql, /grant (select|insert|update|delete).* to anon/i);
  assert.match(sql, /private\.website_studio_can_manage/);
  assert.match(sql, /in \('super_admin','admin'\)/);
  assert.match(sql, /WEBSITE_STUDIO_RESTORE_FORBIDDEN/);
  assert.match(sql, /website_studio_revisions/);
  assert.match(sql, /changed_fields/);
  assert.match(sql, /javascript\\s\*:/);
});

test('original Creatives hero wording and identity remain protected', () => {
  const hero = read('src/components/CollectiveHero.jsx');
  const migration = read('supabase/migrations/20260722210000_connected_website_studio.sql');
  assert.match(hero, /AKLAN CREATIVES/);
  assert.match(hero, /Lahat Liwa Collectives/);
  assert.match(migration, /Serve as a shared space where creatives can present their work, receive proper credit, and publish projects under one collective identity\./);
  assert.doesNotMatch(`${hero}\n${migration}`, /Independent creative platform/);
});
