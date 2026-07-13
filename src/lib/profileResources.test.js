import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isResourceLink, resourceLink, resourceMeta, resourceName } from './profileResources.js';

test('resource entries remain distinguishable inside existing social link JSON', () => {
  const link = resourceLink('Canva', 'https://www.canva.com/design');
  assert.equal(isResourceLink(link), true);
  assert.equal(resourceName(link), 'Canva');
});

test('known tools infer a friendly name and favicon from a safe URL', () => {
  const meta = resourceMeta(resourceLink('', 'https://www.canva.com/design'));
  assert.equal(meta.name, 'Canva');
  assert.equal(meta.icon, 'https://www.canva.com/favicon.ico');
});

test('unsafe resource URLs never become clickable', () => {
  assert.equal(resourceMeta(resourceLink('Bad', 'javascript:alert(1)')).href, '');
});

test('profile inquiry actions preselect the current creative', async () => {
  const hero = await readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8');
  const inquiry = await readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8');
  assert.match(hero, /start-a-project\?creative=\$\{creative\.id\}/);
  assert.match(inquiry, /preferred_creative_id: preferredId/);
});
