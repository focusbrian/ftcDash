import { describe, expect, it } from 'vitest';
import { isImageFile, outputMimeFor } from './image';

const file = (name: string, type: string) => ({ name, type });

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
