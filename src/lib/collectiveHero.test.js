import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const creatives = readFileSync(new URL('../pages/Creatives.jsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../components/CollectiveHero.jsx', import.meta.url), 'utf8');

test('the Creatives route loads a clear contributor-focused brand hero', () => {
  assert.match(app, /pathname === '\/creatives' \? 'creatives'/);
  assert.match(app, /contentArea === 'creatives' \? \['home'\]/);
  assert.match(creatives, /<CollectiveHero content=\{content\} \/>/);
  assert.match(hero, /title: 'People behind the work\.'/);
  assert.match(hero, /description: 'Meet the creatives and collaborators credited across Lahat Liwa projects\./);
  assert.match(hero, /primaryCta: 'View Current Work'/);
});
