import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEditorialDocument } from './editorialDocument.js';

test('normalizes the supported structured block document', () => {
  const result = validateEditorialDocument({ version: 1, blocks: [
    { type: 'heading', level: 2, text: 'Aklan guide' },
    { type: 'paragraph', text: 'A carefully reviewed introduction.' },
    { type: 'facts', items: [{ label: 'Municipality', value: 'Demo only' }] },
  ] });
  assert.equal(result.valid, true);
  assert.equal(result.document.blocks.length, 3);
});

test('rejects scripts, data URLs, and unsupported block types', () => {
  const result = validateEditorialDocument({ version: 1, blocks: [
    { type: 'html', html: '<script>alert(1)</script>' },
    { type: 'image', url: 'data:text/html,<script>alert(1)</script>' },
  ] });
  assert.equal(result.valid, false);
  assert.deepEqual(result.document.blocks, []);
});

test('rejects protocol-relative image URLs that could leave the site', () => {
  const result = validateEditorialDocument({ version: 1, blocks: [{ type: 'image', url: '//example.com/tracker.webp', alt: '' }] });
  assert.equal(result.valid, false);
});

test('keeps bounded content and removes control characters', () => {
  const result = validateEditorialDocument({ version: 1, blocks: [{ type: 'paragraph', text: `hello\u0000${'x'.repeat(12000)}` }] });
  assert.equal(result.valid, true);
  assert.equal(result.document.blocks[0].text.includes('\u0000'), false);
  assert.ok(result.document.blocks[0].text.length <= 10000);
});
