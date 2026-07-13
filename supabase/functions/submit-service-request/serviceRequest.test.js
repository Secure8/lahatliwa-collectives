import assert from 'node:assert/strict';
import test from 'node:test';
import { branchKey, generateReference, notificationOutcome, notificationPlan, REFERENCE_PATTERN, safeBranchDetails, slugify, validateSubmission } from './serviceRequest.js';

function validRequest(overrides = {}) {
  return { branch: 'studio', serviceKey: 'photography', clientName: 'Client Name', clientEmail: 'client@example.com', preferredContactMethod: 'Email', summary: 'Campaign portraits', details: 'We need a portrait campaign with edited images.', consent: true, idempotencyKey: '123e4567-e89b-42d3-a456-426614174000', branchDetails: { eventType: 'Portrait campaign' }, ...overrides };
}

test('server validation accepts a valid request and rejects untrusted values', () => {
  assert.deepEqual(validateSubmission(validRequest()).errors, []);
  assert.ok(validateSubmission(validRequest({ branch: 'unknown' })).errors.length);
  assert.ok(validateSubmission(validRequest({ clientEmail: 'invalid' })).errors.length);
  assert.ok(validateSubmission(validRequest({ consent: false })).errors.length);
  assert.ok(validateSubmission(validRequest({ idempotencyKey: 'guessable' })).errors.length);
  assert.ok(validateSubmission(validRequest({ branch: 'tech', serviceKey: 'diagnostics', branchDetails: {} })).errors.includes('Add the device or platform that needs support.'));
});

test('service values are validated using normalized CMS keys', () => {
  assert.equal(branchKey({ name: 'Lahat Liwa Tech' }), 'tech');
  assert.equal(slugify('Same-day Edits'), 'same-day-edits');
});

test('reference generation is non-sequential and excludes ambiguous characters', () => {
  const first = generateReference(new Date('2026-07-13T00:00:00Z'), new Uint8Array([0, 1, 2, 3, 4, 5]));
  const second = generateReference(new Date('2026-07-13T00:00:00Z'), new Uint8Array([6, 7, 8, 9, 10, 11]));
  assert.match(first, REFERENCE_PATTERN);
  assert.match(second, REFERENCE_PATTERN);
  assert.notEqual(first, second);
});

test('general and creative notification routing never exposes addresses as public data', () => {
  assert.deepEqual(notificationPlan({ hasCreative: false, creativeEmail: '', adminEmail: 'team@example.com', clientEmail: 'client@example.com' }).map((item) => item.key), ['admin', 'client']);
  assert.deepEqual(notificationPlan({ hasCreative: true, creativeEmail: 'creative@example.com', adminEmail: 'team@example.com', clientEmail: 'client@example.com' }).map((item) => item.key), ['admin', 'creative', 'client']);
  assert.equal(notificationOutcome({ admin: 'sent', client: 'sent', creative: 'unavailable' }, true), 'sent');
  assert.equal(notificationOutcome({ admin: 'sent', client: 'failed', creative: 'sent' }, true), 'partially_sent');
  assert.equal(notificationOutcome({ admin: 'failed', client: 'failed' }, false), 'failed');
});

test('branch metadata is bounded and strips control characters', () => {
  const details = safeBranchDetails({ device: 'Phone\u0000', meetingRequested: true, 'bad-key!': 'discard', extra: 'x'.repeat(600) });
  assert.equal(details.device, 'Phone');
  assert.equal(details.meetingRequested, true);
  assert.equal(details['bad-key!'], undefined);
  assert.equal(details.extra.length, 500);
});
