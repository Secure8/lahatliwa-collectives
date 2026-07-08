export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const OUTPUT_TYPE = 'image/webp';
const QUALITY_STEPS = [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68];
const SIZE_STEPS = [2560, 2200, 1920, 1600, 1400, 1200, 1000];

function formatMb(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
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

async function renderCompressedBlob(image, maxSide, quality) {
  const { width, height } = dimensionsWithin(image, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  return canvasToBlob(canvas, OUTPUT_TYPE, quality);
}

export async function compressImageForUpload(file, { label = 'Image', maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!file || file.size <= maxBytes) return file;

  if (!COMPRESSIBLE_TYPES.has(file.type)) {
    throw new Error(`${label} is larger than ${formatMb(maxBytes)} and cannot be compressed automatically.`);
  }

  const image = await loadImage(file);
  let smallestBlob = null;

  for (const maxSide of SIZE_STEPS) {
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

  throw new Error(`${label} could not be compressed below ${formatMb(maxBytes)}. Try a slightly smaller image.`);
}

