import { describe, expect, it } from 'vitest';
import { hasEnclosedFootprint, isClosedLoop } from '../floorPlanGeometry';
import { syntheticRectangleGray } from './fixtureRaster';
import { ingestFloorPlanFromGray } from './ingest';
import {
  consensusScale,
  estimateScaleFromLength,
  parseAreaToSqIn,
  parseLengthToInches,
  parseRoomDimensions,
} from './scale';
import { countOn, otsuThreshold, thresholdGray } from './raster';
import { extractWallMask } from './wallMask';
import { vectorizeWalls } from './vectorize';

describe('floorPlanIngest raster', () => {
  it('Otsu thresholds a dark rectangle ring', () => {
    const gray = syntheticRectangleGray(120, 100, 6, false);
    const mask = thresholdGray(gray);
    const on = countOn(mask);
    expect(on).toBeGreaterThan(100);
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.data.length; i += 1) hist[gray.data[i]!]! += 1;
    const t = otsuThreshold(hist);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
    const explicit = thresholdGray(gray, 128);
    expect(countOn(explicit)).toBeGreaterThan(50);
  });
});

describe('vectorizeWalls', () => {
  it('finds four sides of a hollow rectangle', () => {
    const gray = syntheticRectangleGray(200, 150, 4, true);
    const { wall } = extractWallMask(gray);
    const segments = vectorizeWalls(wall);
    const horiz = segments.filter((s) => Math.abs(s.y0 - s.y1) < 2);
    const vert = segments.filter((s) => Math.abs(s.x0 - s.x1) < 2);
    expect(horiz.length).toBeGreaterThanOrEqual(2);
    expect(vert.length).toBeGreaterThanOrEqual(2);
    expect(segments.length).toBeGreaterThanOrEqual(4);
  });
});

describe('scale parsers', () => {
  it('parses 11\'8"', () => {
    expect(parseLengthToInches("11'8\"")).toBe(11 * 12 + 8);
  });

  it('parses 137 sq ft', () => {
    expect(parseAreaToSqIn('137 sq ft')).toBe(137 * 144);
  });

  it('parses room dimensions 11\'8" x 11\'11"', () => {
    const d = parseRoomDimensions("11'8\" x 11'11\"");
    expect(d).toEqual({ widthIn: 140, depthIn: 143 });
  });
});

describe('consensusScale', () => {
  it('confirms when two estimates agree', () => {
    const a = estimateScaleFromLength(32, 32, 'door');
    const b = estimateScaleFromLength(64, 64, 'wall');
    const c = consensusScale([a, b]);
    expect(c.confirmed).toBe(true);
    expect(c.inchesPerPixel).toBeCloseTo(1, 5);
  });
});

describe('ingestFloorPlanFromGray e2e', () => {
  it('builds a plan with four walls and enclosed footprint', () => {
    const gray = syntheticRectangleGray(200, 150, 8, false);
    const result = ingestFloorPlanFromGray(gray, { inchesPerPixel: 1 });
    expect(result.report.wallCount).toBeGreaterThanOrEqual(4);
    expect(isClosedLoop(result.plan)).toBe(true);
    expect(hasEnclosedFootprint(result.plan)).toBe(true);
    expect(result.underlay.inchesPerPixel).toBe(1);
    expect(result.report.mode).toBe('solid');
  });
});