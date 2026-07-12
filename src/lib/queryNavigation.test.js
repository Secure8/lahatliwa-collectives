import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationScrollPlan, publicRouteBoundaryKey, scrollPreservingNavigationState } from './navigationHistory.js';

const home = (search, key, state = null) => ({ pathname: '/', search, hash: '', key, state });

test('homepage branch PUSH preserves the project-section viewport instead of scrolling to zero', () => {
  const plan = navigationScrollPlan({ navigationType: 'PUSH', previousLocation: home('?branch=studio', 'a'), location: home('?branch=digital', 'b', scrollPreservingNavigationState('home-projects', 920)), currentPosition: 920 });
  assert.deepEqual(plan, { mode: 'preserve', top: 920 });
});

test('query-only navigation is preserved even without component-specific metadata', () => {
  assert.deepEqual(navigationScrollPlan({ navigationType: 'PUSH', previousLocation: home('?branch=studio', 'a'), location: home('?branch=tech', 'b'), currentPosition: 700 }), { mode: 'preserve', top: 700 });
});

test('new pathname navigation still starts at the top', () => {
  assert.deepEqual(navigationScrollPlan({ navigationType: 'PUSH', previousLocation: home('', 'a'), location: { pathname: '/projects', search: '', hash: '', key: 'b' }, currentPosition: 800 }), { mode: 'top', top: 0 });
});

test('POP restores the exact saved position for Back and Forward', () => {
  assert.deepEqual(navigationScrollPlan({ navigationType: 'POP', previousLocation: home('?branch=digital', 'b'), location: home('?branch=studio', 'a'), savedPosition: 880, currentPosition: 0 }), { mode: 'restore', top: 880 });
});

test('homepage route content key ignores query-only changes', () => {
  assert.equal(publicRouteBoundaryKey(home('?branch=studio', 'a')), publicRouteBoundaryKey(home('?branch=social', 'b')));
  assert.notEqual(publicRouteBoundaryKey(home('', 'a')), publicRouteBoundaryKey({ pathname: '/projects', search: '', hash: '', key: 'b' }));
});

test('projects filter navigation uses the same explicit preserve-scroll contract', () => {
  assert.deepEqual(scrollPreservingNavigationState('project-results', 640), { preserveScroll: true, scrollContext: 'project-results', scrollY: 640 });
});
