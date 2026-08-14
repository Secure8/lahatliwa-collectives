import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Creative profile is a professional wall with cover, avatar, identity, and contextual owner actions', async () => {
  const [hero, profile, route, styles] = await Promise.all([
    source('../components/CreativeHero.jsx'), source('../components/CreativeProfileView.jsx'),
    source('../pages/CreativeDetails.jsx'), source('../index.css'),
  ]);
  assert.match(hero, /ll-profile-cover/);
  assert.match(hero, /ll-profile-avatar/);
  assert.match(hero, /ll-profile-cover-back/);
  assert.match(hero, /aria-label="Back to Creatives"/);
  assert.match(hero, /creative\.short_bio/);
  assert.match(hero, /ll-profile-professional-title/);
  assert.doesNotMatch(hero, /<span>Disciplines<\/span>/);
  assert.match(hero, /<ul className="ll-profile-disciplines" aria-label="Creative disciplines">/);
  assert.match(hero, /<li key=\{discipline\}>\{discipline\}<\/li>/);
  assert.match(hero, /availability_status/);
  assert.match(profile, /isOwner && !adminPreview/);
  assert.match(profile, /to="\/create"/);
  assert.match(profile, /Edit details/);
  assert.match(profile, /id="feed"/);
  assert.match(profile, /CreativePostCard/);
  assert.match(route, /account\?\.role === 'creative'/);
  assert.match(styles, /\.ll-profile-cover[\s\S]*?aspect-ratio: 16\/6/);
  assert.match(styles, /\.ll-profile-layout[\s\S]*?grid-template-columns/);
  assert.match(styles, /\.ll-profile-professional-title \{[^}]*color: var\(--site-accent-text\)/);
  assert.match(styles, /\.ll-profile-disciplines li:not\(:last-child\)::after \{ content: "·"/);
  assert.doesNotMatch(styles, /\.ll-profile-disciplines li \{[^}]*border:/);
});

test('profile media and navigation are intentionally responsive without desktop overlay utilities', async () => {
  const [hero, profile, route, styles] = await Promise.all([
    source('../components/CreativeHero.jsx'), source('../components/CreativeProfileView.jsx'),
    source('../pages/CreativeDetails.jsx'), source('../index.css'),
  ]);
  assert.match(hero, /publicImageVariant/);
  assert.match(profile, /ll-profile-tabs/);
  assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?\.ll-profile-identity/);
  assert.match(styles, /\.ll-profile-identity \{ min-height: 18rem; grid-template-columns: auto minmax\(0,1fr\) auto; align-items: start; padding-bottom: 1\.75rem; \}/);
  assert.match(styles, /\.ll-profile-avatar \{ align-self: start; width: 13rem; height: 13rem; margin-top: 1\.5rem; \}/);
  assert.match(styles, /\.ll-profile-avatar \{[^}]*overflow: visible/);
  assert.match(styles, /\.ll-profile-avatar\.is-editable i \{[^}]*z-index: 3/);
  assert.match(styles, /\.ll-profile-cover-back \{[^}]*left: \.85rem/);
  assert.match(styles, /\.ll-profile-intro[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.ll-profile-page/);
  assert.doesNotMatch(route, /pointermove|topControlsVisible|CreativeProfileQuickNav/);
  assert.doesNotMatch(route, /> Back to Creatives</);
  assert.doesNotMatch(profile, /ProfileRails/);
});

test('disciplines have shared count and length limits in every editor and the database', async () => {
  const [rules, hero, inlineEditor, adminEditor, selfEditor, migration, permissionMigration] = await Promise.all([
    source('./creativeProfile.js'),
    source('../components/CreativeHero.jsx'),
    source('../components/CreativeInlineProfileEditor.jsx'),
    source('../pages/admin/CreativeEditor.jsx'),
    source('../pages/admin/MyProfile.jsx'),
    source('../../supabase/migrations/20260814210000_creative_discipline_balance.sql'),
    source('../../supabase/migrations/20260814220000_creative_discipline_function_permissions.sql'),
  ]);
  assert.match(rules, /CREATIVE_DISCIPLINE_MAX_COUNT = 6/);
  assert.match(rules, /CREATIVE_DISCIPLINE_MAX_LENGTH = 40/);
  assert.match(rules, /LEGACY_DISCIPLINE_NAMES/);
  assert.match(hero, /normalizeCreativeDisciplines\(creative\.skills\)/);
  assert.match(inlineEditor, /creativeDisciplineError/);
  assert.match(adminEditor, /normalizeCreativeDisciplines/);
  assert.match(selfEditor, /disabled=\{skills\.length >= CREATIVE_DISCIPLINE_MAX_COUNT\}/);
  assert.match(migration, /valid_creative_disciplines/);
  assert.match(migration, /jsonb_array_length\(value\) <= 6/);
  assert.match(migration, /char_length\(btrim\(item\)\) > 40/);
  assert.match(permissionMigration, /grant execute on function private\.valid_creative_disciplines\(jsonb\)\s+to authenticated, service_role/);
});

test('short Creative bios share one Facebook-style limit across both editors and the database', async () => {
  const [adminEditor, selfEditor, profileRules, migration] = await Promise.all([
    source('../pages/admin/CreativeEditor.jsx'),
    source('../pages/admin/MyProfile.jsx'),
    source('./creativeProfile.js'),
    source('../../supabase/migrations/20260814180000_creative_short_bio_balance.sql'),
  ]);
  assert.match(profileRules, /CREATIVE_SHORT_BIO_MAX_LENGTH = 160/);
  assert.match(adminEditor, /maxLength=\{CREATIVE_SHORT_BIO_MAX_LENGTH\}/);
  assert.match(selfEditor, /maxLength=\{CREATIVE_SHORT_BIO_MAX_LENGTH\}/);
  assert.match(migration, /creative_members_short_bio_length/);
  assert.match(migration, /john-alfred-justo/);
  assert.match(migration, /char_length\(btrim\(short_bio\)\) <= 160/);
});

test('profile owners edit their wall in place, including professional details and media', async () => {
  const [profile, hero, inlineEditor, route, migration, styles] = await Promise.all([
    source('../components/CreativeProfileView.jsx'),
    source('../components/CreativeHero.jsx'),
    source('../components/CreativeInlineProfileEditor.jsx'),
    source('../pages/CreativeDetails.jsx'),
    source('../../supabase/migrations/20260814190000_inline_profile_and_draft_cleanup.sql'),
    source('../index.css'),
  ]);
  assert.match(profile, /CreativeInlineProfileEditor/);
  assert.match(profile, /ProfessionalSection title="Education"/);
  assert.match(profile, /ProfessionalSection title="Achievements"/);
  assert.doesNotMatch(profile, /to="\/admin\/my-profile"/);
  assert.match(hero, /Change profile photo/);
  assert.match(hero, /Change cover photo/);
  assert.match(inlineEditor, /Choose profile photo/);
  assert.match(inlineEditor, /professional_details/);
  assert.match(route, /onCreativeChange=\{setCreative\}/);
  assert.match(migration, /add column if not exists professional_details jsonb/);
  assert.match(route, /location, professional_details/);
  assert.match(styles, /\.ll-profile-editor-layer \{ place-items: center; padding: 1\.25rem; \}/);
  assert.match(styles, /width: min\(42rem, calc\(100vw - 2\.5rem\)\)/);
});

test('profile wall separates posts, formal projects, about details, and professional inquiry', async () => {
  const profile = await source('../components/CreativeProfileView.jsx');
  assert.match(profile, /Personal wall/);
  assert.match(profile, /Formal portfolio/);
  assert.match(profile, /ll-profile-about/);
  assert.match(profile, /Interested in this Creative's work\?/);
  assert.match(profile, /Ask about working together/);
  assert.doesNotMatch(profile, /Admin preview[\s\S]*?Create post/);
});
