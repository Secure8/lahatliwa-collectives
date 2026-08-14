import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const creatives = readFileSync(new URL('../pages/Creatives.jsx', import.meta.url), 'utf8');

test('the Creatives route opens a focused professional directory rather than a campaign hero', () => {
  assert.match(app, /pathname === '\/creatives' \? 'creatives'/);
  assert.match(creatives, /ll-directory-intro/);
  assert.match(creatives, /Creative network/);
  assert.match(creatives, /published posts/);
  assert.doesNotMatch(creatives, /CollectiveHero/);
});
