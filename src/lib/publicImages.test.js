import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePublicImagePath } from './publicImages.js';

test('absolute and signed image URLs remain unchanged', () => {
  const signed = 'https://example.supabase.co/storage/v1/object/sign/project-media/a.webp?token=a%2Bb';
  assert.equal(normalizePublicImagePath(signed), signed);
  assert.equal(normalizePublicImagePath('https://cdn.example.com/a.png?width=400'), 'https://cdn.example.com/a.png?width=400');
});

test('relative and bucket-prefixed paths normalize without double prefixes', () => {
  assert.equal(normalizePublicImagePath('projects/covers/a.webp'), 'projects/covers/a.webp');
  assert.equal(normalizePublicImagePath('project-media/projects/covers/a.webp'), 'projects/covers/a.webp');
});

test('malformed values safely fall back without retrying invalid URLs', () => {
  assert.equal(normalizePublicImagePath(null), '');
  assert.equal(normalizePublicImagePath({ url: 'a.webp' }), '');
  assert.equal(normalizePublicImagePath('javascript:alert(1)'), '');
});
