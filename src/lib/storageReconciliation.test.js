import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyStorageObject, collectReferencePaths, deduplicateQueuePaths, hasActiveCleanupJob, normalizeProjectMediaPath, summarizeClassifications, unwrapReferenceScanResults } from '../../supabase/functions/process-storage-cleanup/reconciliation.js';

test('normalizes public, signed, bucket-prefixed, encoded, and queried paths', () => {
  assert.equal(normalizeProjectMediaPath('https://x.supabase.co/storage/v1/object/public/project-media/a/my%20file.webp?x=1'), 'a/my file.webp');
  assert.equal(normalizeProjectMediaPath('project-media/icons/a.svg'), 'icons/a.svg');
  assert.equal(normalizeProjectMediaPath('/icons/a.svg?cache=1'), 'icons/a.svg');
  assert.equal(normalizeProjectMediaPath('https://example.com/not-our-bucket/a.webp'), '');
});

test('collects references from every nested source shape and deduplicates them', () => {
  const references = collectReferencePaths(
    { cover_image: 'projects/cover.webp', gallery_items: [{ url: 'gallery/a.webp', thumbnail_storage_path: 'thumbs/a.webp' }] },
    { profile_image_url: 'creatives/avatar.webp', cover_image: 'creatives/cover.webp' },
    { logo_url: 'logos/site.svg', hero_image_url: 'heroes/person.webp', default_background_image_url: 'backgrounds/home.webp' },
    { content: { sections: [{ image: 'page-content/nested.webp' }] } },
    { icon_url: 'services/icon.webp', image_url: 'services/image.webp' },
    { storage_path: 'icons/library.svg' },
  );
  assert.equal(references.size, 12);
  assert.equal(references.has('page-content/nested.webp'), true);
  assert.equal(references.has('icons/library.svg'), true);
});

test('classifies referenced, recent, uncertain, confirmed orphan, and invalid objects', () => {
  const now = Date.parse('2026-07-12T00:00:00Z');
  const references = new Set(['used/a.webp']);
  assert.equal(classifyStorageObject({ path: 'used/a.webp', created_at: '2020-01-01' }, references, now).classification, 'referenced');
  assert.equal(classifyStorageObject({ path: 'new/a.webp', created_at: '2026-07-11T12:00:00Z' }, references, now).classification, 'recent');
  assert.equal(classifyStorageObject({ path: 'unknown/a.webp' }, references, now).classification, 'uncertain');
  assert.equal(classifyStorageObject({ path: 'old/a.webp', created_at: '2020-01-01' }, references, now).classification, 'confirmed_orphan');
  assert.equal(classifyStorageObject({ path: '../bad.webp', created_at: '2020-01-01' }, references, now).classification, 'invalid');
});

test('summarizes classifications and deduplicates reviewed queue paths', () => {
  assert.deepEqual(summarizeClassifications([{ classification: 'referenced' }, { classification: 'confirmed_orphan' }, { classification: 'invalid' }]), { total: 3, referenced: 1, recent: 0, uncertain: 0, confirmedOrphan: 1, invalid: 1 });
  assert.deepEqual(deduplicateQueuePaths(['icons/a.svg', 'project-media/icons/a.svg', '../bad.svg']), ['icons/a.svg']);
});

test('a reference-source failure is represented as fail-closed by the orchestrator contract', () => {
  assert.throws(() => unwrapReferenceScanResults([{ status: 'fulfilled', value: [] }, { status: 'rejected', reason: new Error('query failed') }]), /query failed/);
});

test('active cleanup jobs prevent duplicate queue insertion', () => {
  assert.equal(hasActiveCleanupJob([{ status: 'pending' }]), true);
  assert.equal(hasActiveCleanupJob([{ status: 'processing' }]), true);
  assert.equal(hasActiveCleanupJob([{ status: 'failed' }]), true);
  assert.equal(hasActiveCleanupJob([{ status: 'completed' }]), false);
});
