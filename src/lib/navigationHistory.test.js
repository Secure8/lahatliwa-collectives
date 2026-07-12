import assert from 'node:assert/strict';
import test from 'node:test';
import { detailBackAction, publicLocationState, scrollPositionKey, shouldPushFilter } from './navigationHistory.js';

test('project source state preserves route, query, key, and preview anchor', () => {
  const state = publicLocationState({ pathname: '/projects', search: '?branch=studio&search=film', hash: '', key: 'entry-a' }, 'project-1');
  assert.deepEqual(state.from, { pathname: '/projects', search: '?branch=studio&search=film', hash: '', key: 'entry-a' });
  assert.equal(state.anchorId, 'project-1');
});

test('detail Back uses real history when a source exists and a safe fallback otherwise', () => {
  assert.deepEqual(detailBackAction({ from: { pathname: '/projects' } }, 1, '/projects'), { delta: -1 });
  assert.deepEqual(detailBackAction(null, 0, '/projects'), { to: '/projects' });
});

test('scroll positions distinguish history entries and query states', () => {
  assert.notEqual(scrollPositionKey({ key: 'a', pathname: '/projects', search: '?branch=studio', hash: '' }), scrollPositionKey({ key: 'b', pathname: '/projects', search: '?branch=studio', hash: '' }));
  assert.notEqual(scrollPositionKey({ key: 'a', pathname: '/projects', search: '?branch=studio', hash: '' }), scrollPositionKey({ key: 'a', pathname: '/projects', search: '?branch=digital', hash: '' }));
});

test('repeated filter selection does not request another history entry', () => {
  assert.equal(shouldPushFilter('studio', 'studio'), false);
  assert.equal(shouldPushFilter('studio', 'digital'), true);
});
