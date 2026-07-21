import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const creatives = readFileSync(new URL('../pages/Creatives.jsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../components/CollectiveHero.jsx', import.meta.url), 'utf8');

test('the Creatives route loads and renders the original stored homepage hero intact', () => {
  assert.match(app, /pathname === '\/creatives' \? 'creatives'/);
  assert.match(app, /contentArea === 'creatives' \? \['home'\]/);
  assert.match(creatives, /<CollectiveHero content=\{content\} \/>/);
  assert.match(hero, /title: 'Lahat Liwa Collectives'/);
  assert.match(hero, /description: 'Serve as a shared space where creatives can present their work, receive proper credit, and publish projects under one collective identity\.'/);
  assert.doesNotMatch(hero, /Independent creative platform/);
});
