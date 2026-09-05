import { describe, expect, it } from 'vitest';
import { PREPARED_MAX_EDGE, preparedFileName, scaledSize } from './preparePhotoForTrellis';

describe('scaledSize', () => {
  it('leaves images already inside the ceiling alone', () => {
    expect(scaledSize(800, 600, 1024)).toEqual({ width: 800, height: 600 });
    expect(scaledSize(1024, 512, 1024)).toEqual({ width: 1024, height: 512 });
  });

  it('fits the long edge to the ceiling and keeps the aspect ratio', () => {
    expect(scaledSize(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 });
    expect(scaledSize(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('never collapses a thin image to zero', () => {
    expect(scaledSize(5000, 1, PREPARED_MAX_EDGE)).toEqual({ width: 1024, height: 1 });
  });
});

describe('preparedFileName', () => {
  it('slugifies the source name and lands on .jpg', () => {
    expect(preparedFileName('Desk Lamp.HEIC')).toBe('toova-prepared-desk-lamp.jpg');
    expect(preparedFileName('IMG_4821.jpeg')).toBe('toova-prepared-img-4821.jpg');
  });

  it('falls back when the source name carries nothing usable', () => {
    expect(preparedFileName('.png')).toBe('toova-prepared-photo.jpg');
    expect(preparedFileName('___')).toBe('toova-prepared-photo.jpg');
    expect(preparedFileName('')).toBe('toova-prepared-photo.jpg');
  });
});
