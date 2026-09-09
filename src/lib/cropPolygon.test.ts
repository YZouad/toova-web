import { describe, expect, it } from 'vitest';
import {
  isPointInPolygon,
  maskRgbaToPolygon,
  polygonBounds,
  polygonToLocal,
} from './cropPolygon';

describe('isPointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('detects inside and outside points', () => {
    expect(isPointInPolygon(5, 5, square)).toBe(true);
    expect(isPointInPolygon(15, 5, square)).toBe(false);
    expect(isPointInPolygon(-1, 5, square)).toBe(false);
  });

  it('returns false for fewer than three points', () => {
    expect(isPointInPolygon(1, 1, [{ x: 0, y: 0 }, { x: 2, y: 2 }])).toBe(false);
  });
});

describe('polygonBounds', () => {
  it('returns a clamped bounding box', () => {
    const bounds = polygonBounds(
      [
        { x: 12, y: 8 },
        { x: 44, y: 6 },
        { x: 40, y: 30 },
      ],
      100,
      50,
    );
    expect(bounds).toEqual({ x: 12, y: 6, width: 32, height: 24 });
  });
});

describe('polygonToLocal', () => {
  it('translates points into bbox space', () => {
    const bounds = { x: 10, y: 20, width: 30, height: 40 };
    expect(
      polygonToLocal(
        [
          { x: 12, y: 22 },
          { x: 35, y: 50 },
        ],
        bounds,
      ),
    ).toEqual([
      { x: 2, y: 2 },
      { x: 25, y: 30 },
    ]);
  });
});

describe('maskRgbaToPolygon', () => {
  it('masks outside the polygon to white', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const px = i * 4;
      data[px] = 20;
      data[px + 1] = 40;
      data[px + 2] = 60;
      data[px + 3] = 255;
    }

    const { data: masked, bounds } = maskRgbaToPolygon(
      data,
      width,
      height,
      [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
      ],
      'white',
    );

    expect(bounds).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(Array.from(masked.slice(0, 4))).toEqual([20, 40, 60, 255]);
    expect(Array.from(masked.slice(8, 12))).toEqual([255, 255, 255, 255]);
  });

  it('masks outside the polygon to transparent', () => {
    const width = 3;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const px = i * 4;
      data[px] = 100;
      data[px + 1] = 120;
      data[px + 2] = 140;
      data[px + 3] = 200;
    }

    const { data: masked, bounds } = maskRgbaToPolygon(
      data,
      width,
      height,
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      'transparent',
    );

    expect(bounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(masked[3]).toBe(200);
    expect(masked[11]).toBe(0);
  });
});
