import {
  attachGoogleDriveGalleryPreview,
  deleteGoogleDriveMedia,
  uploadGoogleDriveProjectGalleryOriginal,
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
  attachPreview: attachGoogleDriveGalleryPreview,
  deleteMedia: deleteGoogleDriveMedia,
  deletePreview: (path) => deleteImages([path]),
  prepareImage: prepareGalleryImageForUpload,
  uploadOriginal: uploadGoogleDriveProjectGalleryOriginal,
  uploadPreview: uploadPreparedGalleryFile,
};

export async function uploadGoogleDriveGalleryImage(file, { onStatus, requestId, dependencies = {} } = {}) {
  const deps = { ...defaultDependencies, ...dependencies };
  return runGoogleDriveGalleryImageUpload(file, { onStatus, requestId, dependencies: deps });
}

export async function cleanupGoogleDriveGalleryArtifacts(artifacts = [], { deleteMedia = deleteGoogleDriveMedia } = {}) {
  return runGoogleDriveArtifactCleanup(artifacts, deleteMedia);
}
