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

test('post and Collab taxonomy choices share compact responsive multi-select dropdowns', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../pages/CreativePostEditor.jsx', import.meta.url), 'utf8');
  const dropdowns = readFileSync(new URL('../components/WorkTaxonomyDropdowns.jsx', import.meta.url), 'utf8');
  const inquiry = readFileSync(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8');
  assert.match(dropdowns, /function TaxonomyDropdown/);
  assert.match(dropdowns, /type="checkbox" checked=\{checked\}/);
  assert.match(dropdowns, /aria-expanded=\{open\}/);
  assert.match(dropdowns, /const \[openKind, setOpenKind\]/);
  assert.match(editor, /Select all that apply · Optional/);
  assert.match(editor, /<WorkTaxonomyDropdowns terms=\{taxonomy\} selectedIds=\{termIds\}/);
  assert.match(inquiry, /<WorkTaxonomyDropdowns terms=\{terms\} selectedIds=\{selected\}/);
  assert.doesNotMatch(inquiry, /Object\.entries\(groups\)/);
  assert.match(css, /\.ll-work-taxonomy-dropdowns \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.ll-taxonomy-menu \{ position: absolute;[\s\S]*?max\(100%, 18rem\)/);
  assert.match(css, /\.ll-taxonomy-menu-option:focus-within \{ outline: 2px solid var\(--focus-ring\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.ll-work-taxonomy-dropdowns \{ grid-template-columns: minmax\(0, 1fr\); \}[\s\S]*?\.ll-taxonomy-menu,[\s\S]*?position: static; width: 100%/);
  assert.doesNotMatch(css, /\.ll-work-taxonomy-options/);
});
