import assert from 'node:assert/strict';
import test from 'node:test';
import { CREATIVE_PROFILE_TEMPLATES, normalizeCreativeProfileTemplate } from './creativeProfileTemplates.js';

test('social remains the safe default profile template', () => {
  assert.equal(CREATIVE_PROFILE_TEMPLATES[0].key, 'social');
  assert.equal(normalizeCreativeProfileTemplate('gallery'), 'gallery');
  assert.equal(normalizeCreativeProfileTemplate('unknown'), 'social');
});
