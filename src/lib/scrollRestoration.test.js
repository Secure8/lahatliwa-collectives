import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollPositionKey } from './navigationHistory.js';

test('saved positions are keyed by the browser history entry', () => {
  const positions = new Map();
  const listing = { key: 'listing', pathname: '/projects', search: '?branch=studio', hash: '' };
  positions.set(scrollPositionKey(listing), 1240);
  assert.equal(positions.get(scrollPositionKey(listing)), 1240);
  assert.equal(positions.get(scrollPositionKey({ ...listing, key: 'details', pathname: '/projects/sample', search: '' })), undefined);
});

test('new navigation has no stored position and therefore starts at zero', () => {
  assert.equal(new Map().get(scrollPositionKey({ key: 'new', pathname: '/about', search: '', hash: '' })) || 0, 0);
});
