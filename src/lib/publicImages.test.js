import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePublicImagePath, publicImageVariant } from './publicImages.js';

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

test('managed media renderers select the right derivative without rewriting legacy media', () => {
  const expanded = 'https://media.lahatliwa.studio/projects/gallery/project/group/expanded.webp';
  assert.equal(publicImageVariant(expanded, 'thumbnail'), 'https://media.lahatliwa.studio/projects/gallery/project/group/thumbnail.webp');
  assert.equal(publicImageVariant(expanded, 'display'), 'https://media.lahatliwa.studio/projects/gallery/project/group/display.webp');
  assert.equal(publicImageVariant('projects/covers/legacy.webp', 'thumbnail'), 'projects/covers/legacy.webp');
});
