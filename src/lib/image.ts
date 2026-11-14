interface LoadedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  release: () => void;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Stored images only ever need to fill their slot at 2× density: a logo never draws larger than
 * 26 CSS px, and a robot photo never taller than the 190 px line-up.
 */
export const MAX_ASSET_SIZE = {
  logo: { width: 48, height: 48 },
  robot: { width: 200, height: 200 },
} as const;

/** Largest size that fits inside `max` at the source's aspect ratio. Images are never upscaled. */
export function fitInside(source: Size, max: Size): Size {
  if (source.width <= 0 || source.height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, max.width / source.width, max.height / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|tiff?)$/i;

/** Formats that can carry transparency, so they are re-encoded as PNG instead of JPEG. */
const ALPHA_CAPABLE = new Set(['image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

const JPEG_BACKGROUND = '#1e2023';

/** Minimal file shape so the format checks can run outside the browser. */
export interface FileLike {
  name: string;
  type: string;
}

export function isImageFile(file: FileLike): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSION.test(file.name);
}

/** Output format for the stored copy: keep transparency where the source may have it. */
export function outputMimeFor(file: FileLike): 'image/png' | 'image/jpeg' {
  const type = file.type.toLowerCase();
  if (ALPHA_CAPABLE.has(type)) return 'image/png';
  if (type.startsWith('image/')) return 'image/jpeg';
  // Browsers sometimes report an empty type; fall back to the file name.
  return /\.(png|gif|webp|svg|ico)$/i.test(file.name) ? 'image/png' : 'image/jpeg';
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        release: () => bitmap.close(),
      };
    } catch {
      // SVG and a few formats are not always decodable through createImageBitmap.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(url);
    if (!image) throw new Error('That image could not be read.');
    return { ...image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function renderToDataUrl(
  image: LoadedImage,
  max: Size,
  mime: 'image/png' | 'image/jpeg',
): string {
  const size = fitInside({ width: image.width, height: image.height }, max);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot process images.');

  if (mime === 'image/jpeg') {
    // JPEG has no alpha channel, so transparent areas would otherwise turn black.
    context.fillStyle = JPEG_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, 0.85);
}

/**
 * Decodes any image the browser can open, scales it down to fit `max` (aspect ratio kept), and
 * encodes it (PNG when transparency may matter, JPEG otherwise). Local storage only holds a few
 * megabytes, so the box is stepped down until the result fits the budget.
 */
export async function fileToImageDataUrl(
  file: File,
  max: Size,
  budget = 400_000,
): Promise<string> {
  const image = await loadImage(file);
  try {
    if (!image.width || !image.height) {
      throw new Error('That image could not be read.');
    }

    const mime = outputMimeFor(file);
    let box: Size = { ...max };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dataUrl = renderToDataUrl(image, box, mime);
      if (dataUrl.length <= budget) return dataUrl;
      box = { width: Math.round(box.width * 0.7), height: Math.round(box.height * 0.7) };
    }
    throw new Error('That image is too large to store — try a smaller one.');
  } finally {
    image.release();
  }
}

/** Results already computed, so a resize pass over the store does not decode the same image twice. */
const shrinkCache = new Map<string, string | null>();

/**
 * Re-encodes an already-stored data URL when it is bigger than `max`, so images added before the
 * limits existed shrink too. Returns null when the image already fits (or cannot be decoded).
 */
export async function shrinkImageDataUrl(dataUrl: string, max: Size): Promise<string | null> {
  const key = `${max.width}x${max.height}:${dataUrl}`;
  const cached = shrinkCache.get(key);
  if (cached !== undefined) return cached;

  const image = await loadImageFromUrl(dataUrl);
  if (!image) {
    shrinkCache.set(key, null);
    return null;
  }
  try {
    if (image.width <= max.width && image.height <= max.height) {
      shrinkCache.set(key, null);
      return null;
    }
    const mime = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    const smaller = renderToDataUrl(image, max, mime);
    shrinkCache.set(key, smaller);
    return smaller;
  } finally {
    image.release();
  }
}

async function loadImageFromUrl(url: string): Promise<LoadedImage | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('That image could not be read.'));
      element.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      release: () => undefined,
    };
  } catch {
    return null;
  }
}
