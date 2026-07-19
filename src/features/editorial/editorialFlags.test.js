import test from 'node:test';
import assert from 'node:assert/strict';
import { DISABLED_EDITORIAL_FLAGS, normalizeEditorialFlags } from './editorialFlags.js';

test('all subordinate flags fail closed when the module is disabled', () => {
  assert.deepEqual(normalizeEditorialFlags({ public_portal_enabled: true, editorial_studio_enabled: true }), DISABLED_EDITORIAL_FLAGS);
});

test('enabled module exposes only explicitly enabled capabilities', () => {
  const flags = normalizeEditorialFlags({ module_enabled: true, public_portal_enabled: true });
  assert.equal(flags.publicPortalEnabled, true);
  assert.equal(flags.editorialStudioEnabled, false);
  assert.equal(flags.homepageTourismEnabled, false);
});

test('tourism homepage requires both module and public portal flags', () => {
  assert.equal(normalizeEditorialFlags({ module_enabled: true, homepage_tourism_enabled: true }).homepageTourismEnabled, false);
  assert.equal(normalizeEditorialFlags({ module_enabled: true, public_portal_enabled: true, homepage_tourism_enabled: true }).homepageTourismEnabled, true);
});
