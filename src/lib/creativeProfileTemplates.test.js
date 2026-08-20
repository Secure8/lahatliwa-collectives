import assert from 'node:assert/strict';
import test from 'node:test';
import { CREATIVE_PROFILE_TEMPLATES, normalizeCreativeProfileTemplate } from './creativeProfileTemplates.js';

test('Studio is the safe default and legacy layouts map forward', () => {
  assert.deepEqual(CREATIVE_PROFILE_TEMPLATES.map((item) => item.key), ['editorial', 'minimal', 'showcase', 'studio', 'archive']);
  assert.equal(normalizeCreativeProfileTemplate('gallery'), 'showcase');
  assert.equal(normalizeCreativeProfileTemplate('social'), 'studio');
  assert.equal(normalizeCreativeProfileTemplate('unknown'), 'studio');
});
