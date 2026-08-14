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
  assert.match(hero, /availability_status/);
  assert.match(profile, /isOwner && !adminPreview/);
  assert.match(profile, /to="\/create"/);
  assert.match(profile, /to="\/admin\/my-profile"/);
  assert.match(profile, /id="feed"/);
  assert.match(profile, /CreativePostCard/);
  assert.match(route, /account\?\.role === 'creative'/);
  assert.match(styles, /\.ll-profile-cover[\s\S]*?aspect-ratio: 16\/6/);
  assert.match(styles, /\.ll-profile-layout[\s\S]*?grid-template-columns/);
});

test('profile media and navigation are intentionally responsive without desktop overlay utilities', async () => {
  const [hero, profile, route, styles] = await Promise.all([
    source('../components/CreativeHero.jsx'), source('../components/CreativeProfileView.jsx'),
    source('../pages/CreativeDetails.jsx'), source('../index.css'),
  ]);
  assert.match(hero, /publicImageVariant/);
  assert.match(profile, /ll-profile-tabs/);
  assert.match(styles, /@media \(min-width: 900px\)[\s\S]*?\.ll-profile-identity/);
  assert.match(styles, /\.ll-profile-identity \{ grid-template-columns: auto minmax\(0,1fr\) auto; align-items: start; \}/);
  assert.match(styles, /\.ll-profile-avatar \{ align-self: start; margin-top: 2rem; \}/);
  assert.match(styles, /\.ll-profile-cover-back \{[^}]*left: \.85rem/);
  assert.match(styles, /\.ll-profile-intro[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.ll-profile-page/);
  assert.doesNotMatch(route, /pointermove|topControlsVisible|CreativeProfileQuickNav/);
  assert.doesNotMatch(route, /> Back to Creatives</);
  assert.doesNotMatch(profile, /ProfileRails/);
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

test('profile wall separates posts, formal projects, about details, and professional inquiry', async () => {
  const profile = await source('../components/CreativeProfileView.jsx');
  assert.match(profile, /Personal wall/);
  assert.match(profile, /Formal portfolio/);
  assert.match(profile, /ll-profile-about/);
  assert.match(profile, /Interested in this Creative's work\?/);
  assert.match(profile, /Ask about working together/);
  assert.doesNotMatch(profile, /Admin preview[\s\S]*?Create post/);
});
