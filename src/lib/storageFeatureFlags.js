// Phase 1 is intentionally non-operational. These flags are a single client-side
// visibility boundary only; future server implementations must enforce their own
// authorization and configuration before any flag can become true.
export const STORAGE_FEATURE_FLAGS = Object.freeze({
  externalStorageEnabled: false,
  googleDriveConnectorEnabled: false,
  storageMigrationEnabled: false,
});

export function storageFeatureEnabled(flag) {
  return STORAGE_FEATURE_FLAGS[flag] === true;
}
