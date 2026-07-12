import assert from 'node:assert/strict';
import test from 'node:test';
import { fairProjectExposure } from './fairProjectExposure.js';

const credit = (id, extra = {}) => ({ id, name: id, isPublished: true, ...extra });
const project = (id, owner, extra = {}) => ({ id, featured: false, display_order: Number(id.replace(/\D/g, '')) || 99, credits: owner ? [credit(owner)] : [], ...extra });

test('ordering is deterministic, unique, and respects the display limit', () => {
  const input = [project('1', 'a'), project('2', 'b'), project('3', 'a'), project('4', null)];
  const first = fairProjectExposure(input, 3).map(({ id }) => id);
  assert.deepEqual(first, fairProjectExposure(input, 3).map(({ id }) => id));
  assert.equal(new Set(first).size, first.length);
  assert.equal(first.length, 3);
});

test('different creatives are interleaved before one creative repeats', () => {
  const ordered = fairProjectExposure([project('1', 'a'), project('2', 'a'), project('3', 'a'), project('4', 'b'), project('5', 'c')]);
  assert.deepEqual(ordered.slice(0, 3).map(({ credits }) => credits[0].id), ['a', 'b', 'c']);
});

test('featured priority is preserved inside each creative group', () => {
  const ordered = fairProjectExposure([project('1', 'a'), project('2', 'a', { featured: true, display_order: 20 })]);
  assert.equal(ordered[0].id, '2');
});

test('multi-creative assignment is deterministic and primary credit wins', () => {
  const multi = project('1', null, { credits: [credit('b'), credit('a', { isPrimary: true })] });
  assert.deepEqual(fairProjectExposure([multi, project('2', 'a'), project('3', 'b')]).map(({ id }) => id), ['1', '3', '2']);
});

test('uncredited work remains visible after attributed projects', () => {
  assert.deepEqual(fairProjectExposure([project('1', null), project('2', 'a')]).map(({ id }) => id), ['2', '1']);
});

test('disabled, deleted, or private creatives do not form exposure groups', () => {
  const hidden = project('1', null, { credits: [credit('hidden', { isPublished: false })] });
  assert.deepEqual(fairProjectExposure([hidden, project('2', 'active')]).map(({ id }) => id), ['2', '1']);
});

test('a branch represented by one creative still shows all available work', () => {
  assert.deepEqual(fairProjectExposure([project('1', 'a'), project('2', 'a')]).map(({ id }) => id), ['1', '2']);
  assert.deepEqual(fairProjectExposure([]), []);
});
