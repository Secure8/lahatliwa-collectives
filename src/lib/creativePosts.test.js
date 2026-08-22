import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCreativePostInlineStyle, CREATIVE_POST_BLOCK_TYPES, CREATIVE_POST_MAX_IMAGES, creativePostExcerpt, creativePostHasContent, creativePostPlainText, emptyCreativePostDocument, moveCreativePostBlock, normalizeCreativePostDocument, normalizeCreativePostLink } from './creativePosts.js';

test('Creative posts use a bounded structured document instead of HTML', () => {
  assert.deepEqual(CREATIVE_POST_BLOCK_TYPES, ['paragraph', 'heading', 'quote', 'bullet_list', 'numbered_list', 'divider', 'image_group', 'external_embed']);
  const normalized = normalizeCreativePostDocument({ version: 1, blocks: [{ type: 'script', html: '<script>alert(1)</script>' }] });
  assert.equal(normalized.blocks[0].type, 'paragraph');
  assert.equal(JSON.stringify(normalized).includes('<script>'), false);
});

test('post normalization bounds images, marks, links, and list length', () => {
  const ids = Array.from({ length: 14 }, (_, index) => `media-${index}`);
  const document = normalizeCreativePostDocument({ version: 1, blocks: [
    { id: 'copy', type: 'paragraph', content: [{ text: 'Hello', marks: ['bold', 'script', 'italic', 'underline'], href: 'javascript:alert(1)' }] },
    { id: 'gallery', type: 'image_group', mediaIds: ids },
    { id: 'list', type: 'bullet_list', items: Array.from({ length: 50 }, () => 'item') },
  ] });
  assert.deepEqual(document.blocks[0].content[0].marks, ['bold', 'italic', 'underline']);
  assert.equal(document.blocks[0].content[0].href, undefined);
  assert.equal(document.blocks[1].mediaIds.length, CREATIVE_POST_MAX_IMAGES);
  assert.equal(document.blocks[2].items.length, 40);
});

test('content blocks can be reordered without changing their data', () => {
  const document = normalizeCreativePostDocument({ version: 1, blocks: [
    { id: 'first', type: 'paragraph', content: [{ text: 'First', marks: [] }] },
    { id: 'second', type: 'heading', level: 3, content: [{ text: 'Second', marks: [] }] },
  ] });
  const moved = moveCreativePostBlock(document, 'second', -1);
  assert.deepEqual(moved.blocks.map((block) => block.id), ['second', 'first']);
  assert.equal(moved.blocks[0].level, 3);
});

test('plain text and excerpts are derived from blocks', () => {
  const document = emptyCreativePostDocument(); document.blocks[0].content = [{ text: 'A thoughtful creative story with context.', marks: [] }];
  assert.equal(creativePostPlainText(document), 'A thoughtful creative story with context.');
  assert.equal(creativePostExcerpt(document, 12), 'A thoughtful…');
});

test('an untouched composer is not meaningful draft content', () => {
  const empty = emptyCreativePostDocument();
  assert.equal(creativePostHasContent(empty), false);
  empty.blocks[0].content = [{ text: 'A real update', marks: [] }];
  assert.equal(creativePostHasContent(empty), true);
  assert.equal(creativePostHasContent(emptyCreativePostDocument(), [{ id: 'photo' }]), true);
});

test('inline styles are stored as structured segments, never HTML', () => {
  const bold = applyCreativePostInlineStyle([{ text: 'Make this bold', marks: [] }], 5, 9, { mark: 'bold' });
  assert.deepEqual(bold, [{ text: 'Make ', marks: [] }, { text: 'this', marks: ['bold'] }, { text: ' bold', marks: [] }]);
  const linked = applyCreativePostInlineStyle(bold, 5, 9, { href: 'https://example.com/work' });
  assert.match(linked[1].href, /^https:\/\/example\.com\/work/);
  assert.equal(JSON.stringify(linked).includes('<strong>'), false);
});

test('editor links are normalized before autosave validation', () => {
  assert.equal(normalizeCreativePostLink('example.com/work'), 'https://example.com/work');
  assert.equal(normalizeCreativePostLink('javascript:alert(1)'), '');
  assert.equal(normalizeCreativePostLink("https://example.com/creator's-work"), 'https://example.com/creator%27s-work');
  const linked = applyCreativePostInlineStyle([{ text: 'Open this work', marks: [] }], 5, 9, { href: 'example.com/work' });
  assert.equal(linked[1].href, 'https://example.com/work');
  const unlinked = applyCreativePostInlineStyle(linked, 5, 9, { href: '' });
  assert.equal(unlinked.some((segment) => segment.href), false);
});
