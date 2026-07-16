import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createProjectGalleryMediaReference,
  normalizeProjectGalleryMediaReference,
} from './mediaReferences.js';
import {
  GALLERY_STORAGE_DESTINATIONS,
  isGoogleDriveGalleryAvailable,
  runGoogleDriveArtifactCleanup,
  runGoogleDriveGalleryImageUpload,
} from './projectGalleryUploadLifecycle.js';
import {
  normalizeProjectGalleryPreviewPath,
  projectReferencesMediaObject,
  safeExternalMediaResponse,
  validCleanupAuthorization,
} from '../../supabase/functions/_shared/googleDriveMediaLifecycle.js';

const MEDIA_ID = '86e2a5df-e209-4e8a-a796-4fd2b3cde819';
const PROJECT_ID = 'cc2a1a90-f9bc-43ac-b675-6b63b46fecc8';
const projectRoot = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('Supabase remains the default and Drive availability is double-gated', () => {
  assert.equal(GALLERY_STORAGE_DESTINATIONS.supabase, 'supabase');
  assert.equal(isGoogleDriveGalleryAvailable({ frontendEnabled: false, serverEnabled: true, connection: { status: 'connected' } }), false);
  assert.equal(isGoogleDriveGalleryAvailable({ frontendEnabled: true, serverEnabled: false, connection: { status: 'connected' } }), false);
  assert.equal(isGoogleDriveGalleryAvailable({ frontendEnabled: true, serverEnabled: true, connection: null }), false);
  assert.equal(isGoogleDriveGalleryAvailable({ frontendEnabled: true, serverEnabled: true, connection: { status: 'reconnect_required' } }), false);
  assert.equal(isGoogleDriveGalleryAvailable({ frontendEnabled: true, serverEnabled: true, connection: { status: 'connected' } }), true);
});

test('Drive gallery upload finalizes a private original with a public Supabase preview', async () => {
  const calls = [];
  const preparedFile = { name: 'optimized.webp', type: 'image/webp', size: 700 };
  const rawFile = { name: 'original.png', type: 'image/png', size: 1400 };
  const result = await runGoogleDriveGalleryImageUpload(rawFile, { dependencies: {
    prepareImage: async () => ({ file: preparedFile, optimized: true, originalBytes: 1400, finalBytes: 700, message: 'optimized' }),
    uploadOriginal: async (file) => { calls.push(['original', file]); return { media: { id: MEDIA_ID } }; },
    uploadPreview: async (file) => { calls.push(['preview', file]); return 'projects/gallery/preview.webp'; },
    attachPreview: async (id, path) => { calls.push(['attach', id, path]); return { media: {
      id: MEDIA_ID, filename: 'optimized.webp', mimeType: 'image/webp', status: 'available',
      preview: { provider: 'supabase', bucket: 'project-media', storagePath: path },
    } }; },
    deletePreview: async () => { throw new Error('should not clean successful upload'); },
    deleteMedia: async () => { throw new Error('should not clean successful upload'); },
  } });
  assert.equal(result.previewPath, 'projects/gallery/preview.webp');
  assert.deepEqual(result.mediaReference, {
    provider: 'google_drive', mediaObjectId: MEDIA_ID, filename: 'optimized.webp', mimeType: 'image/webp', status: 'available',
    preview: { provider: 'supabase', bucket: 'project-media', storagePath: 'projects/gallery/preview.webp' },
  });
  assert.deepEqual(calls.map(([stage]) => stage), ['original', 'preview', 'attach']);
  assert.equal(calls[0][1], rawFile);
  assert.equal(calls[1][1], preparedFile);
  assert.equal(JSON.stringify(result).includes('drive-file-id'), false);
});

test('preview finalization failure cleans both partial artifacts and reports cleanup failures', async () => {
  const cleanup = [];
  await assert.rejects(() => runGoogleDriveGalleryImageUpload({}, { dependencies: {
    prepareImage: async () => ({ file: { type: 'image/webp' }, optimized: false, originalBytes: 1, finalBytes: 1 }),
    uploadOriginal: async () => ({ media: { id: MEDIA_ID } }),
    uploadPreview: async () => 'projects/gallery/partial.webp',
    attachPreview: async () => { throw new Error('metadata update failed'); },
    deletePreview: async (path) => { cleanup.push(['preview', path]); },
    deleteMedia: async (id) => { cleanup.push(['media', id]); },
  } }), /metadata update failed/);
  assert.deepEqual(cleanup, [
    ['preview', 'projects/gallery/partial.webp'],
    ['media', MEDIA_ID],
  ]);
});

test('a retry recovers an already finalized media record without creating another preview', async () => {
  let previewUploads = 0;
  const result = await runGoogleDriveGalleryImageUpload({}, { requestId: PROJECT_ID, dependencies: {
    prepareImage: async () => ({ file: { type: 'image/webp' }, optimized: false, originalBytes: 1, finalBytes: 1 }),
    uploadOriginal: async (_file, options) => {
      assert.equal(options.requestId, PROJECT_ID);
      return { media: {
        id: MEDIA_ID,
        filename: 'existing.webp',
        mimeType: 'image/webp',
        status: 'available',
        preview: { provider: 'supabase', bucket: 'project-media', storagePath: 'projects/gallery/existing.webp' },
      } };
    },
    uploadPreview: async () => { previewUploads += 1; },
    attachPreview: async () => { throw new Error('should not attach twice'); },
    deletePreview: async () => {},
    deleteMedia: async () => {},
  } });
  assert.equal(result.previewPath, 'projects/gallery/existing.webp');
  assert.equal(previewUploads, 0);
});

test('safe project media references omit provider identifiers and require a Supabase gallery preview', () => {
  const reference = createProjectGalleryMediaReference({
    mediaObjectId: MEDIA_ID,
    filename: 'image.webp',
    mimeType: 'image/webp',
    previewPath: 'projects/gallery/image.webp',
    externalFileId: 'must-not-survive',
  });
  assert.equal(reference.mediaObjectId, MEDIA_ID);
  assert.equal(Object.hasOwn(reference, 'externalFileId'), false);
  assert.equal(normalizeProjectGalleryMediaReference({ provider: 'google_drive', mediaObjectId: MEDIA_ID, preview: { provider: 'google_drive', storagePath: 'private-id' } }), null);
  assert.equal(normalizeProjectGalleryPreviewPath('projects/gallery/image.webp'), 'projects/gallery/image.webp');
  assert.equal(normalizeProjectGalleryPreviewPath('projects/gallery/file.pdf'), '');
  assert.equal(normalizeProjectGalleryPreviewPath('https://drive.google.com/file/private'), '');
});

test('server-safe responses and project authorization expose only the media UUID and preview', () => {
  const item = { media: { provider: 'google_drive', mediaObjectId: MEDIA_ID } };
  assert.equal(projectReferencesMediaObject({ gallery_items: [item] }, MEDIA_ID), true);
  assert.equal(projectReferencesMediaObject({ gallery_items: [] }, MEDIA_ID), false);
  const response = safeExternalMediaResponse({
    id: MEDIA_ID,
    filename: 'image.webp',
    mime_type: 'image/webp',
    size_bytes: 700,
    status: 'available',
    preview_path: 'projects/gallery/image.webp',
    external_file_id: 'private-drive-id',
    external_parent_id: 'private-folder-id',
  });
  assert.equal(response.id, MEDIA_ID);
  assert.equal(JSON.stringify(response).includes('private-drive-id'), false);
  assert.equal(JSON.stringify(response).includes('private-folder-id'), false);
  assert.equal(validCleanupAuthorization({ cleanup_authorization: {
    actor_user_id: 'actor', project_id: PROJECT_ID, expires_at: new Date(Date.now() + 60_000).toISOString(),
  } }, { actorUserId: 'actor', projectId: PROJECT_ID }), true);
});

test('artifact cleanup deduplicates media UUIDs and records failures without accepting Drive IDs', async () => {
  const calls = [];
  const result = await runGoogleDriveArtifactCleanup([
    { mediaReference: { mediaObjectId: MEDIA_ID } },
    { mediaReference: { mediaObjectId: MEDIA_ID } },
    { mediaReference: { mediaObjectId: PROJECT_ID } },
  ], async (id) => {
    calls.push(id);
    if (id === PROJECT_ID) throw new Error('retry later');
  });
  assert.deepEqual(calls, [MEDIA_ID, PROJECT_ID]);
  assert.deepEqual(result, { cleaned: 1, failed: 1 });
});

test('public renderer keeps legacy previews while the project editor exposes one provider-neutral upload flow', async () => {
  const [gallery, form, storage, content, lifecycle] = await Promise.all([
    source('src/lib/galleryItems.js'),
    source('src/components/admin/ProjectForm.jsx'),
    source('src/lib/storage.js'),
    source('src/lib/contentApi.js'),
    source('supabase/functions/google-drive-media-lifecycle/index.ts'),
  ]);
  assert.match(gallery, /getProjectGalleryPreviewPath/);
  assert.match(gallery, /media \? media\.preview\.storagePath/);
  assert.doesNotMatch(form, /galleryStorageDestination|GALLERY_STORAGE_DESTINATIONS|ExternalProjectFiles/);
  assert.doesNotMatch(form, /Private original \+ public preview|Untouched images go privately to Drive/);
  assert.match(form, /Website media/);
  assert.match(storage, /uploadCoverImage/);
  assert.match(storage, /uploadExternalThumbnail/);
  assert.doesNotMatch(content, /supabase\.storage\.from\(BUCKET\)\.upload/);
  assert.match(content, /uploadManagedWebsiteImage/);
  assert.match(lifecycle, /media\.external_file_id/);
  assert.doesNotMatch(lifecycle, /externalFileId|externalParentId|folderId:\s*body/);
});
