import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureJpegForTrellis, isWebpImageFile } from './webpToJpeg';

describe('isWebpImageFile', () => {
  it('detects image/webp MIME type', () => {
    expect(isWebpImageFile(new File(['x'], 'shot.bin', { type: 'image/webp' }))).toBe(true);
  });

  it('detects a .webp extension when MIME type is missing', () => {
    expect(isWebpImageFile(new File(['x'], 'photo.webp', { type: '' }))).toBe(true);
    expect(isWebpImageFile(new File(['x'], 'PHOTO.WEBP', { type: '' }))).toBe(true);
  });

  it('ignores jpeg and png', () => {
    expect(isWebpImageFile(new File(['x'], 'shot.jpg', { type: 'image/jpeg' }))).toBe(false);
    expect(isWebpImageFile(new File(['x'], 'shot.png', { type: 'image/png' }))).toBe(false);
  });
});

describe('ensureJpegForTrellis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns jpeg and png files unchanged', async () => {
    const jpeg = new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' });
    const png = new File(['png'], 'shot.png', { type: 'image/png' });
    expect(await ensureJpegForTrellis(jpeg)).toBe(jpeg);
    expect(await ensureJpegForTrellis(png)).toBe(png);
  });

  it('re-encodes webp as a jpeg file', async () => {
    const jpegBytes = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 4,
      height: 4,
      close,
    }));
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          }),
          toBlob: (cb: (blob: Blob | null) => void, type?: string) => {
            expect(type).toBe('image/jpeg');
            cb(jpegBytes);
          },
        };
      },
    });

    const webp = new File(['webp'], 'lamp.webp', { type: 'image/webp' });
    const jpeg = await ensureJpegForTrellis(webp);

    expect(jpeg).not.toBe(webp);
    expect(jpeg.name).toBe('lamp.jpg');
    expect(jpeg.type).toBe('image/jpeg');
    expect(await jpeg.text()).toBe('jpeg-bytes');
    expect(close).toHaveBeenCalledOnce();
  });
});
