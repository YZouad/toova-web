import { describe, expect, it } from 'vitest';
import {
  AlphaUndoStack,
  applyBrushStroke,
  applyRgbBrushStroke,
  copyAlphaChannel,
  mergeAlphaIntoRgba,
} from './maskBrush';

function rgba(width: number, height: number, alphaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 100;
      data[i + 1] = 120;
      data[i + 2] = 140;
      data[i + 3] = alphaAt(x, y);
    }
  }
  return data;
}

describe('copyAlphaChannel / mergeAlphaIntoRgba', () => {
  it('round-trips alpha without touching RGB', () => {
    const data = rgba(3, 2, (x) => (x === 1 ? 200 : 0));
    const alpha = copyAlphaChannel(data);
    expect([...alpha]).toEqual([0, 200, 0, 0, 200, 0]);

    alpha[1] = 0;
    mergeAlphaIntoRgba(data, alpha);
    expect(data[7]).toBe(0);
    expect(data[5]).toBe(120);
  });
});

describe('applyBrushStroke', () => {
  it('erase clears alpha inside the brush radius', () => {
    const data = rgba(5, 5, () => 255);
    const alpha = copyAlphaChannel(data);
    const initial = copyAlphaChannel(data);

    applyBrushStroke(alpha, initial, 5, 5, 2, 2, 1.5, 'erase');

    expect(alpha[0]).toBe(255);
    expect(alpha[2 * 5 + 2]).toBe(0);
  });

  it('restore copies initial alpha back', () => {
    const data = rgba(4, 4, (x, y) => (x === 1 && y === 1 ? 255 : 0));
    const initial = copyAlphaChannel(data);
    const alpha = new Uint8ClampedArray(initial);
    alpha[1 * 4 + 1] = 0;

    applyBrushStroke(alpha, initial, 4, 4, 1, 1, 1, 'restore');
    expect(alpha[1 * 4 + 1]).toBe(255);
  });

  it('does not paint outside the image bounds', () => {
    const data = rgba(3, 3, () => 255);
    const alpha = copyAlphaChannel(data);
    const initial = copyAlphaChannel(data);

    applyBrushStroke(alpha, initial, 3, 3, 0, 0, 2, 'erase');
    expect(alpha[0]).toBe(0);
    expect(alpha[8]).toBe(255);
  });
});

describe('applyRgbBrushStroke', () => {
  it('erase paints white and keeps alpha opaque', () => {
    const width = 4;
    const height = 4;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const initial = new Uint8ClampedArray(rgba);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 10;
      rgba[i + 1] = 20;
      rgba[i + 2] = 30;
      rgba[i + 3] = 255;
      initial[i] = 10;
      initial[i + 1] = 20;
      initial[i + 2] = 30;
      initial[i + 3] = 255;
    }

    applyRgbBrushStroke(rgba, initial, width, height, 1, 1, 1, 'erase');

    expect(rgba[1 * 4]).toBe(255);
    expect(rgba[1 * 4 + 1]).toBe(255);
    expect(rgba[1 * 4 + 2]).toBe(255);
    expect(rgba[1 * 4 + 3]).toBe(255);
  });

  it('paint uses the chosen color', () => {
    const width = 3;
    const height = 3;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const initial = new Uint8ClampedArray(rgba);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i + 3] = 255;
      initial[i + 3] = 255;
    }

    applyRgbBrushStroke(rgba, initial, width, height, 1, 1, 1, 'paint', [200, 40, 10]);

    expect(rgba[1 * 4]).toBe(200);
    expect(rgba[1 * 4 + 1]).toBe(40);
    expect(rgba[1 * 4 + 2]).toBe(10);
  });
});

describe('AlphaUndoStack', () => {
  it('pops the most recent snapshot', () => {
    const stack = new AlphaUndoStack(3);
    stack.push(new Uint8ClampedArray([1, 2]));
    stack.push(new Uint8ClampedArray([3, 4]));

    expect([...stack.pop()!]).toEqual([3, 4]);
    expect(stack.canUndo).toBe(true);
    expect([...stack.pop()!]).toEqual([1, 2]);
    expect(stack.canUndo).toBe(false);
  });

  it('drops the oldest entry when over the limit', () => {
    const stack = new AlphaUndoStack(2);
    stack.push(new Uint8ClampedArray([1]));
    stack.push(new Uint8ClampedArray([2]));
    stack.push(new Uint8ClampedArray([3]));

    expect([...stack.pop()!]).toEqual([3]);
    expect([...stack.pop()!]).toEqual([2]);
    expect(stack.pop()).toBeNull();
  });
});
