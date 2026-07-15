import { getUploadLimit, isCompressibleUploadImage, validateUploadFile } from './uploadLimits.js';

const OUTPUT_TYPE = 'image/webp';
const QUALITY_STEPS = [0.9, 0.84, 0.78, 0.72, 0.67, 0.62];

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

export function uploadStatusText(status) {
  if (status?.phase === 'compressing') return 'Compressing image...';
  if (status?.phase === 'uploading') {
    if (status.file?.type === 'application/pdf') return 'Uploading document...';
    return status.optimized ? 'Uploading optimized image...' : 'Uploading image...';
  }
  return '';
}
