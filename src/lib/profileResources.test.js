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
  const edge = await readFile(new URL('../../supabase/functions/submit-service-request/index.ts', import.meta.url), 'utf8');
  assert.match(hero, /inquiryUrl\(\{ creative: creative\.slug \}\)/);
  assert.match(inquiry, /creative: searchParams\.get\('creative'\)/);
  assert.match(edge, /preferred_creative_id: creative\?\.id \|\| null/);
});
