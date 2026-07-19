import test from 'node:test';
import assert from 'node:assert/strict';
import { editorialCapabilities } from './editorialCapabilities.js';

test('writer can create and submit but cannot publish or manage settings', () => {
  const capabilities = editorialCapabilities('writer');
  assert.equal(capabilities.canEnter, true);
  assert.equal(capabilities.canCreate, true);
  assert.equal(capabilities.canSubmit, true);
  assert.equal(capabilities.canPublish, false);
  assert.equal(capabilities.canManageSettings, false);
});

test('editor can review and publish without super-admin settings access', () => {
  const capabilities = editorialCapabilities('editor');
  assert.equal(capabilities.canReview, true);
  assert.equal(capabilities.canPublish, true);
  assert.equal(capabilities.canManageSources, true);
  assert.equal(capabilities.canManageSettings, false);
});

test('owner alias receives super-admin editorial capabilities', () => {
  assert.equal(editorialCapabilities('owner').canViewAudit, true);
});

test('creative and viewer cannot enter editorial studio', () => {
  assert.equal(editorialCapabilities('creative').canEnter, false);
  assert.equal(editorialCapabilities('viewer').canEnter, false);
});

test('inactive or unsupported roles receive no editorial capabilities', () => {
  assert.equal(editorialCapabilities('').canEnter, false);
  assert.equal(editorialCapabilities('inactive').canCreate, false);
});
