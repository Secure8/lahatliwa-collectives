// These are UI gates only. Edge Functions independently verify configuration,
// authentication, ownership, and publication eligibility before every operation.
const googleDriveConnectorRequested = import.meta.env?.VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED === 'true';

export const STORAGE_FEATURE_FLAGS = Object.freeze({
  externalStorageEnabled: true,
  googleDriveConnectorEnabled: googleDriveConnectorRequested,
  externalUploadsEnabled: false,
  storageMigrationEnabled: false,
});

export function storageFeatureEnabled(flag) {
  return STORAGE_FEATURE_FLAGS[flag] === true;
}
