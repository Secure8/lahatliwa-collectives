import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { projectLayout } from './creativeProfileLayout.js';

test('profile hero uses responsive campaign dimensions with intentional cover cropping', async () => {
  const source = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  assert.match(source, /data-creative-cover.*aspect-\[16\/9\].*lg:absolute.*lg:inset-0.*lg:h-full.*lg:aspect-auto/);
  assert.match(source, /coverImage/);
  assert.match(source, /className="absolute inset-0 h-full w-full object-cover object-center"/);
  assert.doesNotMatch(source, /min-h-\[63rem\]|min-\[341px\]:min-h-\[61rem\]|min-\[381px\]:min-h-\[60rem\]|sm:min-h-\[54rem\]/);
});

test('unified hero uses the cover background with a circular profile identity', async () => {
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  assert.match(hero, /creative\.cover_image/);
  assert.match(hero, /creative\.profile_image_url/);
  assert.match(hero, /lg:aspect-video/);
  assert.match(hero, /lg:min-h-\[32\.5rem\].*lg:max-h-\[45rem\]/);
  assert.match(hero, /rounded-full/);
  assert.match(hero, /sizes="160px"/);
  assert.match(hero, /function SmoothImage/);
  assert.match(hero, /fetchpriority="auto"/);
  assert.doesNotMatch(hero, /loaded \? 'opacity-100' : 'opacity-0'/);
});

test('mobile hero stacks tools and facts without forcing the desktop dock over content', async () => {
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(hero, /Mobile tools and resources/);
  assert.match(hero, /data-creative-hero-content.*-mt-12.*sm:-mt-16.*lg:mt-0/);
  assert.match(hero, /data-creative-hero-facts.*relative z-10 mx-3 mb-3 lg:hidden/);
  assert.doesNotMatch(hero, /absolute inset-x-3 bottom-3 z-10 lg:hidden/);
  assert.doesNotMatch(styles, /\[aria-label="Tools and resources"\][^{]*\{[^}]*display:\s*flex/);
});

test('mobile cover height is independent from long profile content while overlays stay intact', async () => {
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  assert.match(hero, /theme-inverse[^\n]*bg-\[#09090b\]/);
  assert.match(hero, /data-creative-cover/);
  assert.match(hero, /data-creative-hero-content/);
  assert.match(hero, /creative\.profile_image_url/);
  assert.match(hero, /rounded-full/);
  assert.match(hero, /Creative portfolio/);
  assert.match(hero, /creative\.availability_status/);
  assert.match(hero, /socials\.map\(renderSocial\)/);
  assert.match(hero, /ResourceDock/);
  assert.doesNotMatch(hero, /data-creative-cover[^>]*(?:self-stretch|items-stretch|min-h-full|row-span-)/);
});

test('desktop profile rails frame the cover and content without entering mobile layouts', async () => {
  const profile = await readFile(new URL('../components/CreativeProfileView.jsx', import.meta.url), 'utf8');
  const details = await readFile(new URL('../pages/CreativeDetails.jsx', import.meta.url), 'utf8');
  assert.match(profile, /function ProfileRails/);
  assert.match(profile, /hidden xl:block/);
  assert.match(profile, /absolute inset-0 z-20/);
  assert.match(profile, /inset-y-0 left-0 w-px/);
  assert.match(profile, /inset-y-0 right-0 w-px/);
  assert.match(profile, /inset-x-0 top-0 h-px/);
  assert.match(profile, /shadow-\[0_0_5px_rgba\(251,146,60,0\.4\)\]/);
  assert.doesNotMatch(details, /-top-10/);
  assert.match(details, /min-h-10/);
  assert.match(details, /relative mt-1/);
});

test('creative profiles reveal immersive navigation from the desktop top edge', async () => {
  const navbar = await readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8');
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  const details = await readFile(new URL('../pages/CreativeDetails.jsx', import.meta.url), 'utf8');
  assert.match(navbar, /immersiveProfile/);
  assert.match(navbar, /event\.clientY <= 140/);
  assert.match(navbar, /xl:-translate-y-full xl:opacity-0/);
  assert.match(navbar, /onFocusCapture/);
  assert.match(details, /event\.clientY <= 140/);
  assert.match(details, /fixed left-3 top-\[4\.5rem\]/);
  assert.match(details, /xl:pointer-events-none xl:-translate-y-2 xl:opacity-0/);
  assert.match(hero, /<span>DISCOVER MORE<\/span>/);
  assert.match(hero, /pointer-events-none.*hidden justify-center xl:flex/);
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
