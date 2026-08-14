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
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*?\.ll-profile-page/);
  assert.doesNotMatch(route, /pointermove|topControlsVisible|CreativeProfileQuickNav/);
  assert.doesNotMatch(profile, /ProfileRails/);
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
