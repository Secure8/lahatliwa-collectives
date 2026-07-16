import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EXTERNAL_FILE_MAX_BYTES,
  projectPermissionAllowed,
  replacementCanActivate,
  resumableChunkRange,
  safeExternalFileResponse,
  validateExternalUploadRequest,
} from './externalFileLifecycle.js';
import { runProfileMediaUpload } from './profileExternalStorage.js';

const PROJECT_ID = 'cc2a1a90-f9bc-43ac-b675-6b63b46fecc8';
const PROFILE_ID = '86e2a5df-e209-4e8a-a796-4fd2b3cde819';
const projectRoot = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('raw originals and Drive-only project files accept practical formats up to 5 GB', () => {
  const original = validateExternalUploadRequest({ category: 'project_original', filename: 'RAW Campaign 01.CR3', mimeType: 'image/x-canon-cr3', sizeBytes: 3_000_000_000, projectId: PROJECT_ID });
  assert.equal(original.ok, true);
  assert.equal(original.filename, 'RAW Campaign 01.CR3');
  const zip = validateExternalUploadRequest({ category: 'project_file', filename: 'deliverables.zip', mimeType: 'application/zip', sizeBytes: 4_000_000_000, projectId: PROJECT_ID });
  assert.equal(zip.ok, true);
  assert.equal(validateExternalUploadRequest({ category: 'project_file', filename: 'tool.exe', mimeType: 'application/x-msdownload', sizeBytes: 1, projectId: PROJECT_ID }).code, 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(validateExternalUploadRequest({ category: 'project_file', filename: 'tool.exe', mimeType: 'application/octet-stream', sizeBytes: 1, projectId: PROJECT_ID }).code, 'FILE_TYPE_NOT_ALLOWED');
  assert.equal(validateExternalUploadRequest({ category: 'project_file', filename: 'too-large.zip', mimeType: 'application/zip', sizeBytes: EXTERNAL_FILE_MAX_BYTES + 1, projectId: PROJECT_ID }).code, 'FILE_SIZE_NOT_ALLOWED');
});

test('public preview workflows are limited to supported image originals', () => {
  assert.equal(validateExternalUploadRequest({ category: 'project_original', filename: 'photo.png', mimeType: 'image/png', sizeBytes: 10, projectId: PROJECT_ID, withPreview: true }).ok, true);
  assert.equal(validateExternalUploadRequest({ category: 'project_file', filename: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 10, projectId: PROJECT_ID, withPreview: true }).code, 'PREVIEW_NOT_ALLOWED');
  assert.equal(validateExternalUploadRequest({ category: 'profile_original', filename: 'portrait.webp', mimeType: 'image/webp', sizeBytes: 10, creativeMemberId: PROFILE_ID, withPreview: true }).ok, true);
});

test('resumable ranges cover the file without exceeding the final byte', () => {
  assert.deepEqual(resumableChunkRange(0, 8, 20), { start: 0, end: 7, length: 8, final: false });
  assert.deepEqual(resumableChunkRange(16, 8, 20), { start: 16, end: 19, length: 4, final: true });
});

test('safe lifecycle responses never include Drive identifiers, folder IDs, tokens, or session URLs', () => {
  const response = safeExternalFileResponse({
    id: PROFILE_ID, filename: 'source.psd', mime_type: 'image/vnd.adobe.photoshop', size_bytes: 20,
    file_category: 'project_file', status: 'available', project_id: PROJECT_ID,
    external_file_id: 'private-file-id', external_parent_id: 'private-folder-id',
    credential: 'token', session_url: 'https://www.googleapis.com/private-session',
  });
  const json = JSON.stringify(response);
  assert.equal(json.includes('private-file-id'), false);
  assert.equal(json.includes('private-folder-id'), false);
  assert.equal(json.includes('googleapis.com'), false);
  assert.equal(response.projectId, PROJECT_ID);
});

test('project permissions distinguish view, edit, and manage access', () => {
  const project = { owner_user_id: 'owner', created_by: 'creator' };
  assert.equal(projectPermissionAllowed({ role: 'creative', userId: 'owner', project }, 'manage'), true);
  assert.equal(projectPermissionAllowed({ role: 'creative', userId: 'viewer', project, accessLevel: 'viewer' }, 'view'), true);
  assert.equal(projectPermissionAllowed({ role: 'creative', userId: 'viewer', project, accessLevel: 'viewer' }, 'edit'), false);
  assert.equal(projectPermissionAllowed({ role: 'creative', userId: 'editor', project, accessLevel: 'editor' }, 'edit'), true);
  assert.equal(projectPermissionAllowed({ role: 'creative', userId: 'contributor', creativeMemberId: PROFILE_ID, project, contributorCreativeIds: [PROFILE_ID] }, 'view'), true);
  assert.equal(projectPermissionAllowed({ role: 'creative', userId: 'contributor', creativeMemberId: PROFILE_ID, project, contributorCreativeIds: [PROFILE_ID] }, 'edit'), false);
  assert.equal(projectPermissionAllowed({ role: 'super_admin', userId: 'admin', project }, 'manage'), true);
});

test('replacement activates only after a required preview exists', () => {
  assert.equal(replacementCanActivate({ replaces_media_object_id: PROFILE_ID, preview_required: true, preview_path: null }), false);
  assert.equal(replacementCanActivate({ replaces_media_object_id: PROFILE_ID, preview_required: true, preview_path: 'projects/gallery/new.webp' }), true);
  assert.equal(replacementCanActivate({ replaces_media_object_id: PROFILE_ID, preview_required: false }), true);
});

test('profile originals and public previews remain separate with a safe Supabase-only fallback', async () => {
  const raw = { name: 'portrait.png', type: 'image/png', size: 12 };
  const calls = [];
  const result = await runProfileMediaUpload(raw, {
    driveAvailable: true, creativeMemberId: PROFILE_ID, kind: 'profile', userId: 'user', replacementMediaObjectId: PROJECT_ID,
    dependencies: {
      uploadOriginal: async (file, input) => { calls.push(['original', file, input]); return { id: PROFILE_ID }; },
      uploadPreview: async (file) => { calls.push(['preview', file]); return { url: 'https://supabase.test/portrait.webp', path: 'creative-profiles/user/profile/portrait.webp' }; },
      attachPreview: async (id, path) => { calls.push(['attach', id, path]); return { media: { id } }; },
      cleanup: async () => { throw new Error('cleanup should not run'); },
    },
  });
  assert.equal(calls[0][1], raw);
  assert.equal(calls[1][1], raw);
  assert.equal(calls[0][2].replacementMediaObjectId, PROJECT_ID);
  assert.equal(result.externallyBackedUp, true);

  let originalCalls = 0;
  const fallback = await runProfileMediaUpload(raw, {
    driveAvailable: false, creativeMemberId: PROFILE_ID, kind: 'cover', userId: 'user',
    dependencies: {
      uploadOriginal: async () => { originalCalls += 1; },
      uploadPreview: async () => ({ url: 'https://supabase.test/cover.webp', path: 'creative-profiles/user/cover/cover.webp' }),
    },
  });
  assert.equal(originalCalls, 0);
  assert.equal(fallback.externallyBackedUp, false);
});

test('failed profile preview attachment cleans the newly uploaded private original', async () => {
  const cleaned = [];
  await assert.rejects(() => runProfileMediaUpload({ name: 'photo.png' }, {
    driveAvailable: true, creativeMemberId: PROFILE_ID, kind: 'profile', userId: 'user',
    dependencies: {
      uploadOriginal: async () => ({ id: PROFILE_ID }),
      uploadPreview: async () => ({ url: 'preview', path: 'creative-profiles/user/profile/photo.webp' }),
      attachPreview: async () => { throw new Error('attach failed'); },
      cleanup: async (id) => { cleaned.push(id); },
    },
  }), /attach failed/);
  assert.deepEqual(cleaned, [PROFILE_ID]);
});

test('implementation routes large bodies directly to Google and keeps secrets server-side', async () => {
  const [client, uploadEdge, accessEdge, lifecycleEdge, migration] = await Promise.all([
    source('src/lib/googleDriveStorage.js'),
    source('supabase/functions/google-drive-resumable-upload/index.ts'),
    source('supabase/functions/google-drive-file-access/index.ts'),
    source('supabase/functions/google-drive-file-lifecycle/index.ts'),
    source('supabase/migrations/20260716090000_external_storage_completion.sql'),
  ]);
  assert.match(client, /fetch\(upload\.sessionUrl/);
  assert.match(client, /Content-Range/);
  assert.match(uploadEdge, /generateDriveFileId/);
  assert.match(uploadEdge, /authorizeProject|authorizeTarget/);
  assert.doesNotMatch(uploadEdge, /return.*external_file_id/);
  assert.match(accessEdge, /FILE_ACCESS_DENIED/);
  assert.match(accessEdge, /fetchDriveFileContent/);
  assert.match(lifecycleEdge, /archive_project/);
  assert.match(lifecycleEdge, /remove_preview/);
  assert.match(lifecycleEdge, /PERMANENTLY_DELETE_PRIVATE_FILE/);
  assert.match(migration, /private\.external_upload_sessions/);
  assert.match(migration, /upload_url_secret_id/);
  assert.doesNotMatch(migration, /access_token text|refresh_token text/i);
});
