export {
  EXTERNAL_FILE_CATEGORIES,
  EXTERNAL_FILE_MAX_BYTES,
  RESUMABLE_CHUNK_BYTES,
  externalFileCategory,
  replacementCanActivate,
  projectPermissionAllowed,
  resumableChunkRange,
  safeExternalFilename,
  safeExternalFileResponse,
  validateExternalUploadRequest,
} from '../../supabase/functions/_shared/externalStorageLifecycle.js';
