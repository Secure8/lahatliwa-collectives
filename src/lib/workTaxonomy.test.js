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

test('post taxonomy choices use editorial checkbox rows instead of capsules', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../pages/CreativePostEditor.jsx', import.meta.url), 'utf8');
  assert.match(editor, /type="checkbox" checked=\{termIds\.includes\(term\.id\)\}/);
  assert.match(editor, /Select all that apply · Optional/);
  assert.match(css, /\.ll-work-taxonomy-options \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(12rem, 1fr\)\)/);
  assert.match(css, /\.ll-work-taxonomy-option \{ display: flex;[\s\S]*?border: 0; border-radius: 0; background: transparent/);
  assert.match(css, /\.ll-work-taxonomy-option input \{[\s\S]*?accent-color: var\(--site-accent\)/);
  assert.match(css, /\.ll-work-taxonomy-option:focus-within \{[\s\S]*?outline: 2px solid var\(--focus-ring\)/);
  assert.doesNotMatch(css, /overflow-x: auto; border: 1px solid var\(--theme-border\); border-radius: \.75rem/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.ll-work-taxonomy-options \{ grid-template-columns: 1fr; \}/);
});
