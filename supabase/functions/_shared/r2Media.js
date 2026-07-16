export const R2_PROVIDER = 'cloudflare_r2';
export const R2_VARIANTS = Object.freeze({
  thumbnail: Object.freeze({ maxBytes: 350 * 1024, maxDimension: 640 }),
  display: Object.freeze({ maxBytes: 1_200 * 1024, maxDimension: 1800 }),
  expanded: Object.freeze({ maxBytes: 2_500 * 1024, maxDimension: 2800 }),
});
export const R2_MEDIA_CATEGORIES = Object.freeze({
  project_gallery: Object.freeze({ target: 'project', prefix: 'projects/gallery', primaryVariant: 'expanded' }),
  project_cover: Object.freeze({ target: 'project', prefix: 'projects/covers', primaryVariant: 'expanded' }),
  external_thumbnail: Object.freeze({ target: 'project', prefix: 'projects/external-thumbnails', primaryVariant: 'display' }),
  profile_photo: Object.freeze({ target: 'profile', prefix: 'profiles/photos', primaryVariant: 'display' }),
  profile_cover: Object.freeze({ target: 'profile', prefix: 'profiles/covers', primaryVariant: 'expanded' }),
  site_image: Object.freeze({ target: 'site', prefix: 'site/images', primaryVariant: 'expanded' }),
  service_image: Object.freeze({ target: 'site', prefix: 'site/services', primaryVariant: 'display' }),
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^(?:projects|profiles|site)\/[a-z0-9/_-]+\/[0-9a-f-]{36}\/(?:thumbnail|display|expanded)\.webp$/;

export function r2Configuration(env = {}) {
  const accountId = String(env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = String(env.R2_BUCKET_NAME || '').trim();
  const publicBaseUrl = String(env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  let publicOrigin = null;
  try { publicOrigin = new URL(publicBaseUrl); } catch { publicOrigin = null; }
  const safeBase = publicOrigin && publicOrigin.protocol === 'https:' && !publicOrigin.username && !publicOrigin.password && !publicOrigin.search && !publicOrigin.hash;
  const validNames = /^[a-z0-9][a-z0-9-]{1,62}$/.test(accountId) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(bucketName);
  const configured = env.R2_MEDIA_ENABLED === 'true' && validNames && accessKeyId.length >= 12 && secretAccessKey.length >= 24 && safeBase;
  return { configured, accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl };
}

export function safeR2ObjectKey(value = '') {
  const key = String(value || '').trim();
  return key.length <= 512 && SAFE_KEY.test(key) && !key.includes('..') && !key.includes('//') ? key : '';
}

export function r2PublicUrl(config, objectKey) {
  const key = safeR2ObjectKey(objectKey);
  if (!config?.configured || !key) return '';
  return `${config.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function validateR2UploadRequest(input = {}) {
  const category = R2_MEDIA_CATEGORIES[String(input.category || '')];
  const projectId = String(input.projectId || '');
  const creativeMemberId = String(input.creativeMemberId || '');
  const variants = Array.isArray(input.variants) ? input.variants : [];
  if (!category) return { ok: false, code: 'CATEGORY_NOT_ALLOWED', message: 'The selected media category is unavailable.' };
  if (category.target === 'project' && !UUID_PATTERN.test(projectId)) return { ok: false, code: 'PROJECT_REQUIRED', message: 'Save the project before uploading media.' };
  if (category.target === 'profile' && !UUID_PATTERN.test(creativeMemberId)) return { ok: false, code: 'PROFILE_REQUIRED', message: 'A valid creative profile is required.' };
  if (variants.length !== 3 || new Set(variants.map((item) => item?.variant)).size !== 3) return { ok: false, code: 'VARIANTS_REQUIRED', message: 'Thumbnail, display, and expanded image variants are required.' };
  const cleanVariants = [];
  for (const item of variants) {
    const rule = R2_VARIANTS[item?.variant];
    const sizeBytes = Number(item?.sizeBytes || 0);
    const width = Number(item?.width || 0);
    const height = Number(item?.height || 0);
    if (!rule || item?.mimeType !== 'image/webp' || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > rule.maxBytes
      || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || Math.max(width, height) > rule.maxDimension) {
      return { ok: false, code: 'DERIVATIVE_INVALID', message: 'A website image derivative does not meet the required format, dimensions, or size.' };
    }
    cleanVariants.push({ variant: item.variant, mimeType: 'image/webp', sizeBytes, width, height });
  }
  return { ok: true, categoryKey: String(input.category), category, projectId, creativeMemberId, variants: cleanVariants };
}

export function createR2ObjectKey(category, targetId, groupId, variant) {
  const definition = R2_MEDIA_CATEGORIES[category];
  if (!definition || !UUID_PATTERN.test(targetId) || !UUID_PATTERN.test(groupId) || !R2_VARIANTS[variant]) return '';
  return safeR2ObjectKey(`${definition.prefix}/${targetId}/${groupId}/${variant}.webp`);
}

export function r2ProjectPermissionAllowed({ role, userId, project, accessLevel = '' } = {}, mode = 'edit') {
  if (!project || !userId) return false;
  if (mode === 'delete') return ['super_admin', 'admin'].includes(role) && project.status !== 'published';
  return ['super_admin', 'admin'].includes(role) || project.owner_user_id === userId || project.created_by === userId
    || ['editor', 'manager'].includes(accessLevel);
}

export function r2ProfilePermissionAllowed({ role, creativeMemberId, targetCreativeMemberId } = {}) {
  return ['super_admin', 'admin'].includes(role) || Boolean(creativeMemberId && creativeMemberId === targetCreativeMemberId);
}

export function r2SitePermissionAllowed(role = '') {
  return ['super_admin', 'admin', 'editor'].includes(role);
}

export function validR2DerivativeFile({ variant, filename, mimeType, sizeBytes, expectedBytes, signature } = {}) {
  const rule = R2_VARIANTS[variant];
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature || []);
  return Boolean(rule && filename === `${variant}.webp` && mimeType === 'image/webp'
    && Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes === Number(expectedBytes) && sizeBytes <= rule.maxBytes
    && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP');
}

export function r2CleanupStatus(attemptCount, maxAttempts = 8) {
  return Number(attemptCount || 0) >= maxAttempts ? 'manual_required' : 'retry_required';
}

const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const amzEncode = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const encodedPath = (bucket, key) => `/${amzEncode(bucket)}/${key.split('/').map(amzEncode).join('/')}`;

async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
}

async function hmac(key, value) {
  const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function awsTime(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

async function signingKey(secret, dateStamp) {
  const dateKey = await hmac(`AWS4${secret}`, dateStamp);
  const regionKey = await hmac(dateKey, 'auto');
  const serviceKey = await hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

export async function signedR2Request(fetcher, config, method, objectKey) {
  const key = safeR2ObjectKey(objectKey);
  if (!config?.configured || !key || !['HEAD', 'DELETE'].includes(method)) throw new Error('R2 request configuration is invalid.');
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const { amzDate, dateStamp } = awsTime();
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonical = [method, encodedPath(config.bucketName, key), '', `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  const signature = hex(await hmac(await signingKey(config.secretAccessKey, dateStamp), stringToSign));
  return fetcher(`https://${host}${encodedPath(config.bucketName, key)}`, { method, headers: {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  } });
}

export async function listR2Objects(fetcher, config, { prefix = '', continuationToken = '', maxKeys = 1000 } = {}) {
  if (!config?.configured) throw new Error('R2 list configuration is invalid.');
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const { amzDate, dateStamp } = awsTime();
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const queryValues = [['list-type','2'],['max-keys',String(Math.max(1,Math.min(Number(maxKeys || 1000),1000)))]];
  if (prefix) queryValues.push(['prefix', String(prefix)]);
  if (continuationToken) queryValues.push(['continuation-token', String(continuationToken)]);
  const query = queryValues.map(([name,value]) => `${amzEncode(name)}=${amzEncode(value)}`).sort().join('&');
  const path = `/${amzEncode(config.bucketName)}`;
  const canonical = ['GET', path, query, `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  const signature = hex(await hmac(await signingKey(config.secretAccessKey, dateStamp), stringToSign));
  return fetcher(`https://${host}${path}?${query}`, { method: 'GET', headers: {
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate,
  } });
}

export async function uploadR2Object(fetcher, config, objectKey, mimeType, value) {
  const key = safeR2ObjectKey(objectKey);
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  if (!config?.configured || !key || mimeType !== 'image/webp' || bytes.byteLength <= 0) throw new Error('R2 upload configuration is invalid.');
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const { amzDate, dateStamp } = awsTime();
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const payloadHash = await sha256(bytes);
  const cacheControl = 'public, max-age=31536000, immutable';
  const signedHeaders = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `cache-control:${cacheControl}\ncontent-type:${mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonical = ['PUT', encodedPath(config.bucketName, key), '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  const signature = hex(await hmac(await signingKey(config.secretAccessKey, dateStamp), stringToSign));
  return fetcher(`https://${host}${encodedPath(config.bucketName, key)}`, {
    method: 'PUT',
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'Cache-Control': cacheControl,
      'Content-Type': mimeType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body: bytes,
  });
}

export async function deleteR2Object(fetcher, config, objectKey) {
  const response = await signedR2Request(fetcher, config, 'DELETE', objectKey);
  if (response.ok || response.status === 404) return { deleted: true, alreadyMissing: response.status === 404 };
  throw Object.assign(new Error('R2 object deletion failed.'), { code: 'R2_DELETE_FAILED', status: response.status });
}
