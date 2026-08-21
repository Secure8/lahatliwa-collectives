import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { groupWorkTaxonomy, normalizeWorkMetadata, WORK_AVAILABILITY } from './workTaxonomy.js';

test('work metadata stays compact and safe', () => {
  assert.deepEqual(normalizeWorkMetadata({ title: '  Festival portraits  ', summary: ' A visual story ', work_year: '2026', external_url: 'http://unsafe.test', tags: 'Photo, Aklan, photo' }), {
    title: 'Festival portraits', summary: 'A visual story', work_year: 2026, external_url: null, tags: ['photo', 'aklan'],
  });
});

test('taxonomy is reusable and availability has three clear states', () => {
  const grouped = groupWorkTaxonomy([{ id: '1', kind: 'discipline' }, { id: '2', kind: 'industry' }]);
  assert.equal(grouped.discipline.length, 1);
  assert.equal(grouped.specialty.length, 0);
  assert.deepEqual(WORK_AVAILABILITY.map((item) => item.value), ['available', 'limited', 'unavailable']);
});

test('taxonomy choices use one structured segmented selector instead of scattered capsules', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.ll-work-taxonomy fieldset \{ display: grid; grid-template-columns:/);
  assert.match(css, /\.ll-work-taxonomy fieldset > div,[\s\S]*?overflow-x: auto;[\s\S]*?border-radius: \.75rem/);
  assert.match(css, /\.ll-work-taxonomy button,[\s\S]*?border-radius: 0;/);
  assert.match(css, /button\[aria-pressed="true"\]::after/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.ll-work-taxonomy fieldset/);
});
