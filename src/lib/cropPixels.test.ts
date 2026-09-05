import { describe, expect, it } from 'vitest';
import {
  displayCropToNaturalPixels,
  imageLayoutFromElement,
  naturalPixelsToDisplayCrop,
} from './cropPixels';

describe('displayCropToNaturalPixels', () => {
  it('scales display crop to natural resolution when image fills the element', () => {
    const layout = imageLayoutFromElement(400, 200, 1600, 800);
    expect(
      displayCropToNaturalPixels({ x: 50, y: 25, width: 200, height: 100 }, layout),
    ).toEqual({ x: 200, y: 100, width: 800, height: 400 });
  });

  it('never returns zero width or height', () => {
    const layout = imageLayoutFromElement(100, 50, 1000, 500);
    const result = displayCropToNaturalPixels(
      { x: 0, y: 0, width: 0.4, height: 0.2 },
      layout,
    );
    expect(result.width).toBeGreaterThanOrEqual(1);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('accounts for object-fit letterboxing on the left', () => {
    // Portrait image in a wide box: 200px content centered in 600px element.
    const layout = imageLayoutFromElement(600, 400, 400, 800);
    expect(layout.offsetX).toBe(200);
    expect(layout.contentWidth).toBe(200);

    const natural = displayCropToNaturalPixels(
      { x: 200, y: 0, width: 200, height: 400 },
      layout,
    );
    expect(natural).toEqual({ x: 0, y: 0, width: 400, height: 800 });
  });
});

describe('naturalPixelsToDisplayCrop', () => {
  it('round-trips with displayCropToNaturalPixels', () => {
    const layout = imageLayoutFromElement(320, 240, 1280, 960);
    const natural = { x: 120, y: 80, width: 640, height: 480 };
    const display = naturalPixelsToDisplayCrop(natural, layout);
    const back = displayCropToNaturalPixels(display, layout);
    expect(back).toEqual(natural);
  });

  it('round-trips with letterboxing', () => {
    const layout = imageLayoutFromElement(600, 400, 400, 800);
    const natural = { x: 40, y: 60, width: 320, height: 640 };
    const display = naturalPixelsToDisplayCrop(natural, layout);
    const back = displayCropToNaturalPixels(display, layout);
    expect(back).toEqual(natural);
  });
});

describe('imageLayoutFromElement', () => {
  it('letterboxes a portrait image horizontally', () => {
    const layout = imageLayoutFromElement(600, 400, 400, 800);
    expect(layout.contentWidth).toBe(200);
    expect(layout.contentHeight).toBe(400);
    expect(layout.offsetX).toBe(200);
    expect(layout.offsetY).toBe(0);
  });
});
