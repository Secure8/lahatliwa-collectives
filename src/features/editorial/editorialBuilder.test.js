import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEditorialTemplate, createHistoryState, duplicateEditorialBlock,
  editorialLayoutsFor, insertEditorialBlock, moveEditorialBlock,
  pushHistory, redoHistory, removeEditorialBlock, undoHistory,
} from './editorialBuilder.js';
import { validateEditorialDocument } from './editorialDocument.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('every content type offers three fact-free starting layouts', () => {
  for (const type of ['journal', 'event', 'place', 'activity', 'local_product']) {
    const layouts = editorialLayoutsFor(type);
    assert.equal(layouts.length, 3);
    for (const layout of layouts) {
      const document = createEditorialTemplate(type, layout.key);
      assert.ok(document.blocks.length > 0);
      assert.equal(validateEditorialDocument(document).valid, true);
    }
  }
});
test('block insert, reorder, duplicate, hide-compatible data, and delete are stable', () => {
  let blocks = insertEditorialBlock([], 'paragraph');
  blocks = insertEditorialBlock(blocks, 'heading', 0);
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph']);
  blocks = moveEditorialBlock(blocks, 1, 0);
  assert.deepEqual(blocks.map((block) => block.type), ['paragraph', 'heading']);
  blocks = duplicateEditorialBlock(blocks, 0);
  assert.equal(blocks.length, 3);
  assert.notEqual(blocks[0].id, blocks[1].id);
  blocks[0] = { ...blocks[0], hidden: true };
  assert.equal(validateEditorialDocument({ version: 1, blocks }).document.blocks[0].hidden, true);
  assert.equal(removeEditorialBlock(blocks, 1).length, 2);
});

test('undo and redo keep bounded visual-editor history', () => {
  let history = createHistoryState({ title: 'First' });
  history = pushHistory(history, { title: 'Second' });
  history = pushHistory(history, { title: 'Third' });
  history = undoHistory(history);
  assert.equal(history.present.title, 'Second');
  history = redoHistory(history);
  assert.equal(history.present.title, 'Third');
});

test('visual editor exposes responsive drawers, device preview, inline fields, and friendly save states', () => {
  const studio = source('src/pages/editorial/EditorialStudio.jsx');
  for (const marker of ['Story Structure', 'Add Section', 'Desktop', 'Tablet', 'Mobile', 'Unsaved changes', 'Saving…', 'Saved', 'Save failed']) {
    assert.match(studio, new RegExp(marker));
  }
  assert.match(studio, /function InlineText/);
  assert.match(studio, /function MobileDrawer/);
  assert.match(studio, /function MobileEditorToolbar/);
  assert.match(studio, /draggable/);
  assert.doesNotMatch(studio, /dangerouslySetInnerHTML/);
});

test('visual builder migration preserves URL safety while allowing empty draft image slots', () => {
  const sql = source('supabase/migrations/20260720140000_editorial_visual_builder_foundation.sql');
  assert.match(sql, /v_url<>'' and not/);
  assert.match(sql, /publisher text not null default ''/);
  assert.match(sql, /note text not null default ''/);
  assert.doesNotMatch(sql, /grant execute[\s\S]+anon/i);
  assert.doesNotMatch(sql, /delete from public\.editorial/);
});
