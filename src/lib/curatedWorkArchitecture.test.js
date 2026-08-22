import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Discover uses canonical Creative Work with shared taxonomy filters', () => {
  const discover = read('src/pages/Discover.jsx');
  const routes = read('src/App.jsx');
  const taxonomy = read('src/lib/workTaxonomy.js');
  assert.match(routes, /path="\/discover"/);
  assert.match(routes, /path="\/work\/:slug"/);
  assert.match(discover, /discipline.*specialty.*industry/);
  assert.match(discover, /loadPublicCreativeFeed/);
  assert.match(taxonomy, /creative_post_taxonomy/);
  assert.match(taxonomy, /creative_member_taxonomy/);
});

test('Discover native dropdown options remain readable in both themes', () => {
  const styles = read('src/index.css');
  assert.match(styles, /\.ll-discover-filters select \{[^}]*color-scheme: dark;/);
  assert.match(styles, /\.ll-discover-filters select option,[\s\S]*?background-color: #18181b; color: #f7f7f4;/);
  assert.match(styles, /:root\[data-theme="light"\] \.ll-discover-filters select option,[\s\S]*?background-color: #fff; color: #050505;/);
});

test('Home uses one Creative directory strip and keeps work in a readable centered column', () => {
  const home = read('src/pages/Home.jsx');
  const styles = read('src/index.css');
  assert.match(home, /className="ll-creative-strip"/);
  assert.doesNotMatch(home, /CreativeCard|ll-discovery-panel|Meet the Creatives/);
  assert.match(styles, /\.ll-home-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(styles, /--ll-work-reading-width: 48rem/);
  assert.match(styles, /\.ll-network-home \.ll-feed-shell \{[^}]*width: min\(100%, var\(--ll-work-reading-width\)\);[^}]*margin-inline: auto;/);
});

test('primary public pages use the wide viewport canvas instead of a narrow fixed container', () => {
  const styles = read('src/index.css');
  assert.match(styles, /--ll-public-content-inset: clamp\(1\.5rem, 3vw, 3\.5rem\)/);
  for (const selector of ['.page-shell', '.ll-feed-intro', '.ll-creative-strip', '.ll-home-layout', '.ll-profile-route']) {
    assert.match(styles, new RegExp(selector.replace('.', '\\\.') + '[\\s\\S]*?width: calc\\(100% - var\\(--ll-public-content-inset\\)\\)'));
  }
  assert.match(styles, /\.ll-profile-route \{[\s\S]*?width: 100%;/);
});

test('Creative profiles use the stable Studio presentation over shared data', () => {
  const profile = read('src/components/CreativeProfileView.jsx');
  const editor = read('src/components/CreativeInlineProfileEditor.jsx');
  assert.match(profile, /data-profile-template="studio"/);
  assert.match(profile, /Selected work/);
  assert.match(profile, /Direct inquiry/);
  assert.doesNotMatch(profile, /Portfolio style|normalizeCreativeProfileTemplate/);
  assert.doesNotMatch(editor, /Choose your portfolio style|TemplatePreview|profile_template/);
  assert.doesNotMatch(profile, /Followers|Following|Like count|Reaction/);
});

test('curated Work migration is additive, role-safe, and keeps legacy content compatible', () => {
  const migration = read('supabase/migrations/20260821090000_curated_work_discovery.sql');
  assert.match(migration, /alter table public\.creative_posts/);
  assert.match(migration, /creative_taxonomy_terms/);
  assert.match(migration, /creative_post_taxonomy/);
  assert.match(migration, /creative_member_taxonomy/);
  assert.match(migration, /profile_template set default 'studio'/);
  assert.match(migration, /curated_work_profile_guard_states/);
  assert.match(migration, /enable trigger/);
  assert.ok(migration.indexOf('drop constraint if exists creative_members_profile_template_check') < migration.indexOf('update public.creative_members set profile_template'));
  assert.ok(migration.indexOf('drop constraint if exists creative_members_availability_status_check') < migration.indexOf('update public.creative_members set availability_status'));
  assert.match(migration, /to anon, authenticated using \(is_active\)/);
  assert.doesNotMatch(migration, /drop\s+(table|schema|database)|truncate\s+/i);
});

test('inquiries remain private and reuse the same Work categories', () => {
  const inquiry = read('src/pages/StartProject.jsx');
  assert.match(inquiry, /loadWorkTaxonomy/);
  assert.match(inquiry, /work_categories/);
  assert.match(inquiry, /Your message will be private to the selected Creative and the Super Admin/);
  assert.match(inquiry, /kind.*platform/);
});

test('Super Admin can maintain canonical taxonomy without destructive term deletion', () => {
  const routes = read('src/App.jsx');
  const admin = read('src/pages/admin/AdminTaxonomy.jsx');
  const migration = read('supabase/migrations/20260821090000_curated_work_discovery.sql');
  assert.match(routes, /path="\/admin\/taxonomy"/);
  assert.match(admin, /Disciplines.*Specialties.*Industries/);
  assert.match(admin, /Archive/);
  assert.doesNotMatch(admin, /\.delete\(\)/);
  assert.match(migration, /creative_taxonomy_moderator_insert/);
  assert.match(migration, /creative_taxonomy_moderator_update/);
});
