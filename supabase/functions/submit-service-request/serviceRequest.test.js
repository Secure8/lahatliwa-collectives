import assert from 'node:assert/strict';
import test from 'node:test';
import { branchKey, deliverNotificationPlan, generateReference, notificationOutcome, REFERENCE_PATTERN, safeBranchDetails, slugify, validateSubmission } from './serviceRequest.js';

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

test('successful creative delivery emails only the selected creative and client', async () => {
  const deliveries = [];
  const result = await deliverNotificationPlan({
    hasCreative: true,
    creativeEmail: 'creative@example.com',
    adminEmail: 'team@example.com',
    clientEmail: 'client@example.com',
    send: async (item) => deliveries.push(item),
  });
  assert.deepEqual(deliveries, [
    { key: 'creative', recipient: 'creative@example.com' },
    { key: 'client', recipient: 'client@example.com' },
  ]);
  assert.equal(deliveries.some((item) => item.recipient === 'team@example.com'), false);
  assert.equal(result.nextState.client, 'sent');
  assert.equal(result.notificationStatus, 'sent');
});

test('general inquiries email the administrative inbox and client', async () => {
  const deliveries = [];
  const result = await deliverNotificationPlan({
    hasCreative: false,
    creativeEmail: '',
    adminEmail: 'team@example.com',
    clientEmail: 'client@example.com',
    send: async (item) => deliveries.push(item),
  });
  assert.deepEqual(deliveries.map((item) => item.key), ['admin', 'client']);
  assert.equal(result.notificationStatus, 'sent');
});

test('failed creative delivery falls back to the administrative inbox and still confirms the client', async () => {
  const deliveries = [];
  const result = await deliverNotificationPlan({
    hasCreative: true,
    creativeEmail: 'creative@example.com',
    adminEmail: 'team@example.com',
    clientEmail: 'client@example.com',
    send: async (item) => {
      deliveries.push(item);
      if (item.key === 'creative') throw new Error('provider rejected creative delivery');
    },
  });
  assert.deepEqual(deliveries.map((item) => item.key), ['creative', 'admin_fallback', 'client']);
  assert.equal(result.nextState.creative, 'failed');
  assert.equal(result.nextState.admin_fallback, 'sent');
  assert.equal(result.nextState.client, 'sent');
  assert.equal(result.notificationStatus, 'partially_sent');
});

test('missing creative email falls back safely without attempting direct delivery', async () => {
  const deliveries = [];
  const result = await deliverNotificationPlan({
    hasCreative: true,
    creativeEmail: '',
    adminEmail: 'team@example.com',
    clientEmail: 'client@example.com',
    send: async (item) => deliveries.push(item),
  });
  assert.deepEqual(deliveries.map((item) => item.key), ['admin_fallback', 'client']);
  assert.equal(result.nextState.creative, 'unavailable');
  assert.equal(result.nextState.admin_fallback, 'sent');
  assert.equal(result.nextState.client, 'sent');
  assert.equal(result.notificationStatus, 'partially_sent');
});

test('notification outcomes distinguish normal delivery, fallback, and failure', () => {
  assert.equal(notificationOutcome({ creative: 'sent', client: 'sent' }, true), 'sent');
  assert.equal(notificationOutcome({ creative: 'failed', admin_fallback: 'sent', client: 'sent' }, true), 'partially_sent');
  assert.equal(notificationOutcome({ admin: 'sent', client: 'failed' }, false), 'partially_sent');
  assert.equal(notificationOutcome({ admin: 'failed', client: 'failed' }, false), 'failed');
});

test('branch metadata is bounded and strips control characters', () => {
  const details = safeBranchDetails({ device: 'Phone\u0000', meetingRequested: true, 'bad-key!': 'discard', extra: 'x'.repeat(600) });
  assert.equal(details.device, 'Phone');
  assert.equal(details.meetingRequested, true);
  assert.equal(details['bad-key!'], undefined);
  assert.equal(details.extra.length, 500);
});
