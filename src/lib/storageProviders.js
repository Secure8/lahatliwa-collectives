import { DEFAULT_MEDIA_BUCKET, DEFAULT_STORAGE_PROVIDER, STORAGE_PROVIDERS, normalizeMediaReference, requireStorageProvider } from './mediaReferences.js';

const capability = (values) => Object.freeze({
  directUpload: false,
  resumableUpload: false,
  publicDelivery: false,
  privateDelivery: false,
  serverSideCopy: false,
  checksumVerification: false,
  delete: false,
  publicPreviewRecommended: false,
  ...values,
});

export const STORAGE_PROVIDER_CAPABILITIES = Object.freeze({
  supabase: capability({ directUpload: true, resumableUpload: true, publicDelivery: true, privateDelivery: true, serverSideCopy: true, checksumVerification: true, delete: true }),
  google_drive: capability({ resumableUpload: true, privateDelivery: true, serverSideCopy: true, checksumVerification: true, delete: true, publicPreviewRecommended: true }),
  onedrive: capability({ resumableUpload: true, privateDelivery: true, serverSideCopy: true, checksumVerification: true, delete: true, publicPreviewRecommended: true }),
  dropbox: capability({ resumableUpload: true, privateDelivery: true, serverSideCopy: true, checksumVerification: true, delete: true, publicPreviewRecommended: true }),
  s3_compatible: capability({ directUpload: true, resumableUpload: true, publicDelivery: true, privateDelivery: true, serverSideCopy: true, checksumVerification: true, delete: true }),
});

export const OPERATIONAL_STORAGE_PROVIDERS = Object.freeze([DEFAULT_STORAGE_PROVIDER]);

export function getStorageProviderCapabilities(provider = DEFAULT_STORAGE_PROVIDER) {
  requireStorageProvider(provider);
  return STORAGE_PROVIDER_CAPABILITIES[provider];
}

export function isOperationalStorageProvider(provider) {
  return OPERATIONAL_STORAGE_PROVIDERS.includes(provider);
}

function unsupported(provider, operation) {
  return { ok: false, code: 'STORAGE_PROVIDER_UNSUPPORTED', provider, operation, message: `${provider} is not configured for ${operation}.` };
}

function failed(provider, operation, error) {
  return { ok: false, code: error?.code || 'STORAGE_PROVIDER_ERROR', provider, operation, message: error?.message || 'The storage operation failed.' };
}

export function createStorageProvider(provider = DEFAULT_STORAGE_PROVIDER, dependencies = {}) {
  requireStorageProvider(provider);
  const operational = isOperationalStorageProvider(provider);
  const capabilities = getStorageProviderCapabilities(provider);
  const reject = (operation) => Promise.resolve(unsupported(provider, operation));

  if (!operational) {
    return Object.freeze({
      id: provider,
      operational: false,
      getCapabilities: () => capabilities,
      validateConnection: () => reject('validateConnection'),
      createUploadSession: () => reject('createUploadSession'),
      completeUpload: () => reject('completeUpload'),
      getDisplayUrl: () => reject('getDisplayUrl'),
      getDownloadUrl: () => reject('getDownloadUrl'),
      deleteObject: () => reject('deleteObject'),
      copyObject: () => reject('copyObject'),
      verifyObject: () => reject('verifyObject'),
      refreshMetadata: () => reject('refreshMetadata'),
    });
  }

  const client = dependencies.supabaseClient;
  const requireClient = (operation) => client?.storage ? null : unsupported(provider, operation);
  return Object.freeze({
    id: provider,
    operational: true,
    getCapabilities: () => capabilities,
    validateConnection: async () => ({ ok: true, provider, status: 'connected' }),
    createUploadSession: () => reject('createUploadSession'),
    completeUpload: () => reject('completeUpload'),
    async getDisplayUrl(input) {
      const media = normalizeMediaReference(input);
      if (media.originalValue && /^https?:\/\//i.test(media.originalValue)) return { ok: true, provider, url: media.originalValue };
      const missing = requireClient('getDisplayUrl');
      if (missing) return missing;
      const { data } = client.storage.from(media.bucket || DEFAULT_MEDIA_BUCKET).getPublicUrl(media.storagePath || '');
      return data?.publicUrl ? { ok: true, provider, url: data.publicUrl } : unsupported(provider, 'getDisplayUrl');
    },
    getDownloadUrl: () => reject('getDownloadUrl'),
    async deleteObject(input) {
      const missing = requireClient('deleteObject');
      if (missing) return missing;
      const media = normalizeMediaReference(input);
      if (!media.storagePath) return unsupported(provider, 'deleteObject');
      try {
        const { error } = await client.storage.from(media.bucket || DEFAULT_MEDIA_BUCKET).remove([media.storagePath]);
        return error ? failed(provider, 'deleteObject', error) : { ok: true, provider, storagePath: media.storagePath };
      } catch (error) {
        return failed(provider, 'deleteObject', error);
      }
    },
    copyObject: () => reject('copyObject'),
    verifyObject: () => reject('verifyObject'),
    refreshMetadata: () => reject('refreshMetadata'),
  });
}

export function storageProviderCatalog() {
  return STORAGE_PROVIDERS.map((provider) => ({
    provider,
    operational: isOperationalStorageProvider(provider),
    capabilities: getStorageProviderCapabilities(provider),
  }));
}
