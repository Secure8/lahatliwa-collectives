import {
  attachGoogleDriveExternalPreview,
  permanentlyDeleteGoogleDriveFile,
  uploadGoogleDriveResumableFile,
} from './googleDriveStorage.js';
import {
  deleteImages,
  prepareGalleryImageForUpload,
  uploadPreparedGalleryFile,
} from './storage.js';
import {
  GALLERY_STORAGE_DESTINATIONS,
  isGoogleDriveGalleryAvailable,
  runGoogleDriveArtifactCleanup,
  runGoogleDriveGalleryImageUpload,
} from './projectGalleryUploadLifecycle.js';

export { GALLERY_STORAGE_DESTINATIONS, isGoogleDriveGalleryAvailable } from './projectGalleryUploadLifecycle.js';

const defaultDependencies = {
  attachPreview: attachGoogleDriveExternalPreview,
  deleteMedia: permanentlyDeleteGoogleDriveFile,
  deletePreview: (path) => deleteImages([path]),
  prepareImage: prepareGalleryImageForUpload,
  uploadOriginal: (file, { projectId, replacementMediaObjectId } = {}) => uploadGoogleDriveResumableFile(file, {
    category: 'project_original',
    projectId,
    withPreview: true,
    replacementMediaObjectId,
  }),
  uploadPreview: uploadPreparedGalleryFile,
};

export async function uploadGoogleDriveGalleryImage(file, { onStatus, requestId, projectId, replacementMediaObjectId = '', dependencies = {} } = {}) {
  const deps = { ...defaultDependencies, ...dependencies };
  return runGoogleDriveGalleryImageUpload(file, { onStatus, requestId, projectId, replacementMediaObjectId, dependencies: deps });
}

export async function cleanupGoogleDriveGalleryArtifacts(artifacts = [], { deleteMedia = permanentlyDeleteGoogleDriveFile } = {}) {
  return runGoogleDriveArtifactCleanup(artifacts, deleteMedia);
}
