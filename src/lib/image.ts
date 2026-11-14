interface LoadedImage {
  width: number;
  height: number;
  source: CanvasImageSource;
  release: () => void;
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
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function renderToDataUrl(
  image: LoadedImage,
  maxEdge: number,
  mime: 'image/png' | 'image/jpeg',
): string {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

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
 * Decodes any image the browser can open, scales it down to fit `maxEdge`, and encodes it
 * (PNG when transparency may matter, JPEG otherwise). Local storage only holds a few
 * megabytes, so the resolution is stepped down until the result fits the budget.
 */
export async function fileToImageDataUrl(
  file: File,
  maxEdge: number,
  budget = 400_000,
): Promise<string> {
  const image = await loadImage(file);
  try {
    if (!image.width || !image.height) {
      throw new Error('That image could not be read.');
    }

    const mime = outputMimeFor(file);
    let edge = maxEdge;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dataUrl = renderToDataUrl(image, edge, mime);
      if (dataUrl.length <= budget) return dataUrl;
      edge = Math.round(edge * 0.7);
    }
    throw new Error('That image is too large to store — try a smaller one.');
  } finally {
    image.release();
  }
}
