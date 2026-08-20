import assert from 'node:assert/strict';
import test from 'node:test';
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
