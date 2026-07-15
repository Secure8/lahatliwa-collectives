import assert from 'node:assert/strict';
import test from 'node:test';
import { detailBackAction, horizontalScrollPositionKey, horizontalScrollTarget, publicLocationState, scrollPositionKey, shouldPushFilter } from './navigationHistory.js';

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

test('horizontal rail positions are isolated by history entry and region', () => {
  const location = { key: 'home-a', pathname: '/', search: '?branch=studio', hash: '' };
  assert.notEqual(horizontalScrollPositionKey(location, 'home-featured-projects'), horizontalScrollPositionKey(location, 'home-featured-creatives'));
  assert.notEqual(horizontalScrollPositionKey(location, 'home-featured-projects'), horizontalScrollPositionKey({ ...location, key: 'home-b' }, 'home-featured-projects'));
});

test('horizontal rails restore on Back or Forward and reset on new navigation', () => {
  assert.equal(horizontalScrollTarget('POP', 418.5), 418.5);
  assert.equal(horizontalScrollTarget('PUSH', 418.5), 0);
  assert.equal(horizontalScrollTarget('REPLACE', 418.5), 0);
  assert.equal(horizontalScrollTarget('POP', undefined), 0);
});

test('repeated filter selection does not request another history entry', () => {
  assert.equal(shouldPushFilter('studio', 'studio'), false);
  assert.equal(shouldPushFilter('studio', 'digital'), true);
});
