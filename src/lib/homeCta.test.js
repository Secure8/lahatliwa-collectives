import assert from 'node:assert/strict';
import test from 'node:test';
import { homeCtaPath } from './homeCta.js';

test('home hero CTA labels preserve their announced legacy destinations', () => {
  assert.equal(homeCtaPath('View Projects', '/inquiry'), '/projects');
  assert.equal(homeCtaPath('Contact Us', '/projects'), '/contact');
  assert.equal(homeCtaPath('Send an Inquiry', '/projects'), '/inquiry');
  assert.equal(homeCtaPath('Explore Published Work', '/inquiry'), '/projects');
});

test('custom CMS labels retain the established position destination', () => {
  assert.equal(homeCtaPath('Plan something together', '/inquiry'), '/inquiry');
  assert.equal(homeCtaPath('See what is new', '/projects'), '/projects');
  assert.equal(homeCtaPath('', '/projects'), '/projects');
});
