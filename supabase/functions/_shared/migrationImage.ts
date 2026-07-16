import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.41';
import { R2_VARIANTS } from './r2Media.js';

let initialized: Promise<void> | null = null;

async function ensureInitialized() {
  initialized ||= (async () => {
    const wasmBytes = await Deno.readFile(new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.41')));
    await initializeImageMagick(wasmBytes);
  })();
  return initialized;
}

function dimensionsWithin(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function renderVariant(source: Uint8Array, variant: string) {
  const rule = R2_VARIANTS[variant];
  const qualities = [90, 84, 78, 72, 66, 60];
  const scales = [1, 0.9, 0.8, 0.7, 0.6];
  let smallest: any = null;
  for (const scale of scales) {
    for (const quality of qualities) {
      const result = ImageMagick.read(source, (image: any) => {
        if (typeof image.autoOrient === 'function') image.autoOrient();
        const target = dimensionsWithin(Number(image.width), Number(image.height), Math.max(320, Math.round(rule.maxDimension * scale)));
        image.resize(target.width, target.height);
        image.quality = quality;
        const bytes = image.write(MagickFormat.WebP, (data: Uint8Array) => Uint8Array.from(data));
        return { bytes, width: target.width, height: target.height };
      });
      if (!smallest || result.bytes.byteLength < smallest.bytes.byteLength) smallest = result;
      if (result.bytes.byteLength <= rule.maxBytes) return { variant, mimeType: 'image/webp', ...result };
    }
  }
  throw Object.assign(new Error(`${variant} derivative exceeds its safe website limit.`), { code: 'MIGRATION_DERIVATIVE_TOO_LARGE' });
}

export async function createServerWebsiteDerivatives(source: Uint8Array) {
  await ensureInitialized();
  const derivatives = [];
  for (const variant of ['thumbnail','display','expanded']) derivatives.push(await renderVariant(source, variant));
  return derivatives;
}
