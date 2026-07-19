import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseEditorialWorkflow, editorialWorkflowError, safeEditorialWorkflowRequest } from './editorialWorkflow.js';

const postId = '123e4567-e89b-12d3-a456-426614174000';
const revisionId = '123e4567-e89b-12d3-a456-426614174001';

test('recognizes supplemental Writer and Editor roles without enabling Creative-only accounts', () => {
  assert.equal(canUseEditorialWorkflow({ role: 'creative', editorial_roles: ['writer', 'editor'], status: 'active' }), true);
  assert.equal(canUseEditorialWorkflow({ role: 'creative', editorial_roles: ['creative'], status: 'active' }), false);
  assert.equal(canUseEditorialWorkflow({ role: 'writer', editorial_roles: [], status: 'active' }), true);
  assert.equal(canUseEditorialWorkflow({ role: 'super_admin', status: 'active' }), true);
  assert.equal(canUseEditorialWorkflow({ role: 'editor', editorial_roles: [], status: 'disabled' }), false);
});

test('accepts allowlisted workflow actions with a UUID post identifier', () => {
  assert.deepEqual(safeEditorialWorkflowRequest({ action: 'publish', postId }), { action: 'publish', payload: { postId } });
  assert.deepEqual(safeEditorialWorkflowRequest({ action: 'delete', postId }), { action: 'delete', payload: { postId } });
  assert.deepEqual(safeEditorialWorkflowRequest({ action: 'restore_revision', postId, revisionId }), { action: 'restore_revision', payload: { postId, revisionId } });
});

test('rejects unknown actions and invalid identifiers before database access', () => {
  assert.equal(safeEditorialWorkflowRequest({ action: 'delete_everything', postId }), null);
  assert.equal(safeEditorialWorkflowRequest({ action: 'publish', postId: 'undefined' }), null);
  assert.equal(safeEditorialWorkflowRequest({ action: 'restore_revision', postId, revisionId: 'bad' }), null);
});

test('bounds save metadata and preserves structured documents', () => {
  const request = safeEditorialWorkflowRequest({
    action: 'save_revision', postId, document: { version: 1, blocks: [] }, metadata: { title: 'Draft' },
    seoTitle: `  ${'a'.repeat(220)}  `, expectedCurrentRevisionId: revisionId,
  });
  assert.equal(request.payload.seoTitle.length, 180);
  assert.deepEqual(request.payload.document, { version: 1, blocks: [] });
  assert.equal(request.payload.expectedCurrentRevisionId, revisionId);
});

test('normalizes schedule timestamps and bounds notes', () => {
  const schedule = safeEditorialWorkflowRequest({ action: 'schedule', postId, scheduledFor: '2027-01-01T10:00:00+08:00' });
  assert.equal(schedule.payload.scheduledFor, '2027-01-01T02:00:00.000Z');
  assert.equal(safeEditorialWorkflowRequest({ action: 'schedule', postId, scheduledFor: 'tomorrow' }), null);
  assert.equal(safeEditorialWorkflowRequest({ action: 'archive', postId, note: 'x'.repeat(700) }).payload.note.length, 500);
});

test('maps authorization, conflict, missing-row, and invalid-input errors safely', () => {
  assert.equal(editorialWorkflowError({ message: 'EDITORIAL_NOT_AUTHORIZED' }).status, 403);
  assert.equal(editorialWorkflowError({ message: 'EDITORIAL_REVISION_CONFLICT' }).status, 409);
  assert.equal(editorialWorkflowError({ message: 'EDITORIAL_POST_NOT_FOUND' }).status, 404);
  assert.equal(editorialWorkflowError({ code: '22023' }).status, 400);
  assert.doesNotMatch(editorialWorkflowError({ message: 'secret token abc' }).message, /secret|token|abc/i);
});
