import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHeroBackgroundRender, normalizeHeroOverlayOpacity } from './heroBackground.js';

test('hero overlay opacity preserves zero, half, and full CMS values', () => {
  for (const value of [0, 0.5, 1]) {
    const render = createHeroBackgroundRender({ imageUrl: '/hero.jpg', overlayOpacity: value });
    assert.equal(render.overlayOpacity, value);
    assert.equal(render.overlayStyle.opacity, value);
    assert.equal(render.overlayStyle.backgroundColor, 'var(--hero-overlay-color, #09090b)');
  }
});

test('hero overlay opacity normalizes invalid and out-of-range values safely', () => {
  assert.equal(normalizeHeroOverlayOpacity('invalid'), 0.55);
  assert.equal(normalizeHeroOverlayOpacity(-1), 0);
  assert.equal(normalizeHeroOverlayOpacity(2), 1);
});

test('collective hero and admin preview use the shared overlay style without a theme-recolored utility', async () => {
  const [collectiveHero, settings, css] = await Promise.all([
    readFile(new URL('../components/CollectiveHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/SiteSettings.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);
  assert.match(collectiveHero, /className="hero-background-overlay absolute inset-0" style=\{background\.overlayStyle\}/);
  assert.match(settings, /className="hero-background-overlay absolute inset-0" style=\{background\.overlayStyle\}/);
  assert.doesNotMatch(collectiveHero, /className="absolute inset-0 bg-zinc-950" style=\{\{ opacity:/);
  assert.match(css, /--hero-overlay-color: #2b2622/);
  assert.doesNotMatch(css, /\.hero-background-overlay[\s\S]*?background(?:-color)?:\s*(?:white|#fff)/i);
});
