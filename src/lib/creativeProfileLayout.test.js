import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { projectLayout } from './creativeProfileLayout.js';

test('cover uses uniform mobile, tablet, and desktop ratios with intentional cropping', async () => {
  const source = await readFile(new URL('../components/CreativeCover.jsx', import.meta.url), 'utf8');
  assert.match(source, /aspect-\[4\/3\].*sm:aspect-\[3\/2\].*lg:aspect-video/);
  assert.match(source, /object-cover/);
  assert.match(source, /objectPosition/);
});

test('unified hero uses the profile image, campaign dimensions, and no separate cover', async () => {
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  const profile = await readFile(new URL('../components/CreativeProfileView.jsx', import.meta.url), 'utf8');
  assert.match(hero, /creative\.profile_image_url/);
  assert.match(hero, /lg:aspect-video/);
  assert.match(hero, /lg:min-h-\[32\.5rem\].*lg:max-h-\[45rem\]/);
  assert.doesNotMatch(profile, /creative\.cover_image/);
});

test('mobile hero stacks tools and facts without forcing the desktop dock over content', async () => {
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(hero, /Mobile tools and resources/);
  assert.match(hero, /pb-72.*sm:pb-40.*lg:pb-10/);
  assert.doesNotMatch(styles, /\[aria-label="Tools and resources"\][^{]*\{[^}]*display:\s*flex/);
});

test('profile hero upload retains large-image quality limits', async () => {
  const source = await readFile(new URL('./uploadLimits.js', import.meta.url), 'utf8');
  assert.match(source, /creativeProfile:[\s\S]*?maxBytes: 1\.5 \* MB,[\s\S]*?maxDimension: 2200/);
});

test('project editorial pattern is deterministic across reloads', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => projectLayout(index)), ['feature', 'half', 'half', 'offset-large', 'offset-small', 'cinematic', 'feature', 'half']);
});

test('project counts keep every final row balanced', () => {
  assert.equal(projectLayout(0, 1), 'feature');
  assert.deepEqual([0, 1].map((index) => projectLayout(index, 2)), ['half', 'half']);
  assert.deepEqual([0, 1, 2].map((index) => projectLayout(index, 3)), ['feature', 'half', 'half']);
  assert.deepEqual([0, 1, 2, 3].map((index) => projectLayout(index, 4)), ['feature', 'half', 'half', 'feature']);
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => projectLayout(index, 8)), ['feature', 'half', 'half', 'offset-large', 'offset-small', 'cinematic', 'feature', 'feature']);
});
