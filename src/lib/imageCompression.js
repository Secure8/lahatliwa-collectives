import { getUploadLimit, isCompressibleUploadImage, validateUploadFile } from './uploadLimits.js';

const OUTPUT_TYPE = 'image/webp';
const QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72, 0.67, 0.62];
export const WEBSITE_DERIVATIVES = Object.freeze({
  thumbnail: { maxBytes: 350 * 1024, maxDimension: 640, quality: 0.82 },
  display: { maxBytes: 1_200 * 1024, maxDimension: 1800, quality: 0.86 },
  expanded: { maxBytes: 2_500 * 1024, maxDimension: 2800, quality: 0.9 },
});

export function formatFileSize(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

function replaceExtension(name, extension) {
  return name.replace(/\.[^.]+$/, '') + extension;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Image compression failed.'));
    }, type, quality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image could not be loaded for compression.'));
    };
    image.src = url;
  });
}

function releaseImage(image) {
  if (typeof image?.close === 'function') image.close();
}

function imageSignature(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

export async function validateMigrationImageSource(file, { maxBytes = 25 * 1024 * 1024, maxPixels = 40_000_000, maxSide = 12_000 } = {}) {
  if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Object.assign(new Error('Only still JPEG, PNG, and WebP images can be migrated in the browser.'), { code: 'SOURCE_FORMAT_UNSUPPORTED' });
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxBytes) throw Object.assign(new Error('This source is too large for safe browser migration.'), { code: 'SOURCE_TOO_LARGE_FOR_BROWSER' });
  const header = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  if (imageSignature(header) !== file.type) throw Object.assign(new Error('The source file type does not match its image signature.'), { code: 'SOURCE_SIGNATURE_MISMATCH' });
  if (file.type === 'image/webp') {
    const chunks = new TextDecoder('latin1').decode(header);
    if (chunks.includes('ANIM') || chunks.includes('ANMF')) throw Object.assign(new Error('Animated WebP files require manual review.'), { code: 'ANIMATED_IMAGE_UNSUPPORTED' });
  }
  const image = await loadImage(file);
  try {
    const width = image.naturalWidth || image.width; const height = image.naturalHeight || image.height;
    if (!width || !height || width > maxSide || height > maxSide || width * height > maxPixels) throw Object.assign(new Error('The source dimensions are too large for safe browser migration.'), { code: 'SOURCE_DIMENSIONS_TOO_LARGE' });
    return { width, height };
  } finally { releaseImage(image); }
}

function dimensionsWithin(image, maxSide) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longestSide = Math.max(width, height);

  if (longestSide <= maxSide) return { width, height };

  const scale = maxSide / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function dimensionSteps(maxDimension) {
  return [1, 0.9, 0.8, 0.7, 0.6, 0.5]
    .map((scale) => Math.max(320, Math.round(maxDimension * scale)))
    .filter((dimension, index, dimensions) => dimensions.indexOf(dimension) === index);
}

async function renderCompressedBlob(image, maxSide, quality) {
  const { width, height } = dimensionsWithin(image, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Image compression is not available in this browser.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  return canvasToBlob(canvas, OUTPUT_TYPE, quality);
}

async function renderWebsiteDerivative(image, variant, rule) {
  let smallest = null;
  const qualities = [rule.quality, 0.82, 0.76, 0.7, 0.64];
  for (const maxSide of dimensionSteps(rule.maxDimension)) {
    const dimensions = dimensionsWithin(image, maxSide);
    for (const quality of qualities) {
      const blob = await renderCompressedBlob(image, maxSide, quality);
      const candidate = { blob, width: dimensions.width, height: dimensions.height };
      if (!smallest || blob.size < smallest.blob.size) smallest = candidate;
      if (blob.size <= rule.maxBytes) return candidate;
    }
  }
  throw new Error(`${variant} image could not be prepared without reducing quality too far.`);
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function compressImageForUpload(file, {
  label = 'Image',
  maxBytes,
  maxDimension,
  onStatus,
} = {}) {
  if (!file || !isCompressibleUploadImage(file)) return file;
  let statusAnnounced = false;
  if (file.size > maxBytes) {
    onStatus?.({ phase: 'compressing', originalBytes: file.size, fileName: file.name });
    statusAnnounced = true;
    await yieldToBrowser();
  }
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const requiresResize = Math.max(sourceWidth, sourceHeight) > maxDimension;

  if (file.size <= maxBytes && !requiresResize) return file;

  if (!statusAnnounced) {
    onStatus?.({ phase: 'compressing', originalBytes: file.size, fileName: file.name });
    await yieldToBrowser();
  }
  let smallestBlob = null;

  for (const maxSide of dimensionSteps(maxDimension)) {
    for (const quality of QUALITY_STEPS) {
      const blob = await renderCompressedBlob(image, maxSide, quality);
      if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;

      if (blob.size <= maxBytes) {
        return new File([blob], replaceExtension(file.name, '.webp'), {
          type: OUTPUT_TYPE,
          lastModified: Date.now(),
        });
      }
    }
  }

  throw new Error(`${label} could not be optimized to ${formatFileSize(maxBytes)} without reducing quality too far. Please compress it manually or choose a smaller image.`);
}

export async function optimizeImageForUpload(file, limitKey, { label = 'Image', onStatus } = {}) {
  validateUploadFile(file, limitKey);
  const rule = getUploadLimit(limitKey);
  const optimizedFile = await compressImageForUpload(file, {
    label,
    maxBytes: rule.maxBytes,
    maxDimension: rule.maxDimension,
    onStatus,
  });
  const optimized = optimizedFile !== file;

  return {
    file: optimizedFile,
    optimized,
    originalBytes: file.size,
    finalBytes: optimizedFile.size,
    message: optimized
      ? `Image optimized from ${formatFileSize(file.size)} to ${formatFileSize(optimizedFile.size)}`
      : '',
  };
}

export async function createWebsiteImageDerivatives(file, { label = 'Image', onStatus } = {}) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) throw new Error(`${label} must be a JPEG, PNG, WebP, or SVG image.`);
  onStatus?.({ phase: 'compressing', originalBytes: file.size, fileName: file.name, message: 'Preparing website image sizes…' });
  await yieldToBrowser();
  const image = await loadImage(file);
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase() || 'image';
  const derivatives = [];
  try {
    for (const [variant, rule] of Object.entries(WEBSITE_DERIVATIVES)) {
      onStatus?.({ phase: 'transforming', variant, originalBytes: file.size, fileName: file.name, message: `Preparing ${variant} image...` });
      await yieldToBrowser();
      const rendered = await renderWebsiteDerivative(image, variant, rule);
      derivatives.push({
        variant,
        file: new File([rendered.blob], `${baseName}-${variant}.webp`, { type: OUTPUT_TYPE, lastModified: Date.now() }),
        mimeType: OUTPUT_TYPE,
        sizeBytes: rendered.blob.size,
        width: rendered.width,
        height: rendered.height,
      });
    }
    return derivatives;
  } finally { releaseImage(image); }
}

export function uploadStatusText(status) {
  if (status?.phase === 'compressing') return 'Compressing image...';
  if (status?.phase === 'uploading') {
    if (status.file?.type === 'application/pdf') return 'Uploading document...';
    return status.optimized ? 'Uploading optimized image...' : 'Uploading image...';
  }
  return '';
}
