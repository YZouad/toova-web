import { describe, expect, it } from 'vitest';
import { imageFileFromBlob, imageFileFromClipboardData } from './clipboardImage';

describe('clipboardImage', () => {
  it('wraps an image blob as a clipboard file', () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const file = imageFileFromBlob(blob);
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe('clipboard.png');
    expect(file?.type).toBe('image/png');
  });

  it('keeps an existing image File name', () => {
    const original = new File(['jpg'], 'shot.jpg', { type: 'image/jpeg' });
    const file = imageFileFromBlob(original);
    expect(file).toBe(original);
  });

  it('rejects non-image blobs', () => {
    expect(imageFileFromBlob(new Blob(['txt'], { type: 'text/plain' }))).toBeNull();
  });

  it('picks the first image file from clipboard data', () => {
    const image = new File(['png'], 'pasted.png', { type: 'image/png' });
    const data = {
      files: [image],
      items: [],
    } as unknown as DataTransfer;
    expect(imageFileFromClipboardData(data)?.name).toBe('pasted.png');
  });
});
