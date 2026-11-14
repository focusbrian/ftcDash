import { describe, expect, it } from 'vitest';
import { fitInside, isImageFile, outputMimeFor } from './image';

const file = (name: string, type: string) => ({ name, type });

describe('fitInside', () => {
  it('keeps the aspect ratio and fits the whole image inside the box', () => {
    expect(fitInside({ width: 300, height: 150 }, { width: 48, height: 48 })).toEqual({
      width: 48,
      height: 24,
    });
    expect(fitInside({ width: 1000, height: 2000 }, { width: 200, height: 200 })).toEqual({
      width: 100,
      height: 200,
    });
  });

  it('never upscales an image that already fits', () => {
    expect(fitInside({ width: 32, height: 32 }, { width: 48, height: 48 })).toEqual({
      width: 32,
      height: 32,
    });
    expect(fitInside({ width: 200, height: 130 }, { width: 200, height: 200 })).toEqual({
      width: 200,
      height: 130,
    });
  });

  it('rounds to whole pixels and keeps at least one of each', () => {
    expect(fitInside({ width: 1536, height: 1024 }, { width: 200, height: 200 })).toEqual({
      width: 200,
      height: 133,
    });
    expect(fitInside({ width: 4000, height: 10 }, { width: 48, height: 48 })).toEqual({
      width: 48,
      height: 1,
    });
  });
});

describe('isImageFile', () => {
  it('accepts any image MIME type', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/avif']) {
      expect(isImageFile(file('asset.bin', type))).toBe(true);
    }
  });

  it('falls back to the file extension when the type is missing', () => {
    expect(isImageFile(file('logo.PNG', ''))).toBe(true);
    expect(isImageFile(file('robot.jpeg', ''))).toBe(true);
    expect(isImageFile(file('notes.pdf', 'application/pdf'))).toBe(false);
  });
});

describe('outputMimeFor', () => {
  it('keeps formats that can carry transparency as PNG', () => {
    expect(outputMimeFor(file('logo.png', 'image/png'))).toBe('image/png');
    expect(outputMimeFor(file('logo.webp', 'image/webp'))).toBe('image/png');
    expect(outputMimeFor(file('logo.svg', 'image/svg+xml'))).toBe('image/png');
  });

  it('stores opaque photos as JPEG', () => {
    expect(outputMimeFor(file('robot.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(outputMimeFor(file('robot.avif', 'image/avif'))).toBe('image/jpeg');
  });

  it('guesses from the name when no type is reported', () => {
    expect(outputMimeFor(file('logo.png', ''))).toBe('image/png');
    expect(outputMimeFor(file('robot.bmp', ''))).toBe('image/jpeg');
  });
});
