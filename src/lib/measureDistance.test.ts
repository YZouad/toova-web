import { describe, expect, it } from 'vitest';
import {
  dominantMeasureAxis,
  formatMeasureInches,
  formatMeasureReadout,
  measureDistances,
  measureImportAcceptInches,
  measureValueForField,
} from './measureDistance';

describe('measureDistances', () => {
  it('computes 3D, horizontal, and vertical spans', () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [3, 4, 0];
    const d = measureDistances(a, b);
    expect(d.diagonal3d).toBe(5);
    expect(d.horizontal).toBe(3);
    expect(d.vertical).toBe(4);
    expect(d.width).toBe(3);
    expect(d.height).toBe(4);
    expect(d.depth).toBe(0);
  });

  it('uses axis-aligned width and depth', () => {
    const a: [number, number, number] = [10, 48, 20];
    const b: [number, number, number] = [22, 60, 32];
    expect(measureValueForField(a, b, 'width')).toBe(12);
    expect(measureValueForField(a, b, 'depth')).toBe(12);
  });

  it('uses horizontal span for clearance', () => {
    const a: [number, number, number] = [10, 48, 20];
    const b: [number, number, number] = [10, 60, 32];
    expect(measureValueForField(a, b, 'clearance')).toBe(12);
  });

  it('uses vertical span for height', () => {
    const a: [number, number, number] = [0, 12, 0];
    const b: [number, number, number] = [40, 36, 40];
    expect(measureValueForField(a, b, 'height')).toBe(24);
  });
});

describe('formatMeasureInches', () => {
  it('rounds to one decimal', () => {
    expect(formatMeasureInches(24.04)).toBe('24');
    expect(formatMeasureInches(24.06)).toBe('24.1');
  });
});

describe('measureImportAcceptInches', () => {
  it('writes the axis component for width, height, and depth', () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [3, 4, 12];
    expect(measureImportAcceptInches(a, b, 'width')).toBe(3);
    expect(measureImportAcceptInches(a, b, 'height')).toBe(4);
    expect(measureImportAcceptInches(a, b, 'depth')).toBe(12);
  });

  it('writes the floor-plane span for clearance', () => {
    const a: [number, number, number] = [10, 48, 20];
    const b: [number, number, number] = [10, 60, 32];
    expect(measureImportAcceptInches(a, b, 'clearance')).toBe(12);
  });
});

describe('formatMeasureReadout', () => {
  const fmt = (inches: number) => `${inches}"`;

  it('always shows straight-line distance as the primary label', () => {
    const readout = formatMeasureReadout([0, 0, 0], [24, 0, 0], fmt);
    expect(readout.primary).toBe('Distance 24"');
    expect(readout.secondary).toBe('W 24" · D 0" · H 0"');
  });

  it('shows 3D distance even when separation is mostly on one axis', () => {
    const readout = formatMeasureReadout([0, 0, 0], [0, 0, 28], fmt);
    expect(dominantMeasureAxis([0, 0, 0], [0, 0, 28])).toBe('depth');
    expect(readout.primary).toBe('Distance 28"');
    expect(readout.secondary).toBe('W 0" · D 28" · H 0"');
  });

  it('includes import field value in secondary, not primary', () => {
    const readout = formatMeasureReadout([0, 0, 0], [24, 0, 0], fmt, 'depth');
    expect(readout.primary).toBe('Distance 24"');
    expect(readout.secondary).toBe('Depth 0" · W 24" · D 0" · H 0"');
  });

  it('shows distance for diagonal separation', () => {
    const readout = formatMeasureReadout([0, 0, 0], [38, 0, 55], fmt);
    expect(readout.primary).toBe(`Distance ${Math.hypot(38, 55)}"`);
    expect(readout.secondary).toBe('W 38" · D 55" · H 0"');
  });
});
