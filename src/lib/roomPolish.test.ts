import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseAppearance, DEFAULT_APPEARANCE, CATALOG_APPEARANCE } from './roomAppearance';
import {
  resolveRenderQuality,
  parseVisualSettings,
  DEFAULT_VISUAL_SETTINGS,
} from './renderQuality';
import { framingForPreset } from './presentationCameras';
import { applyFloorShapeUVs, applyWallSlabUVs } from './shapeUVs';
import { parseEnvironment } from './environmentPersist';
import { DEFAULT_ROOM_GEOMETRY } from './roomGeometry';
import { wallSlabs, buildWallGeometry } from '../scene/Wall';

describe('parseAppearance', () => {
  it('returns defaults for empty input', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it('merges partial appearance without wiping unknowns', () => {
    const a = parseAppearance({ wallPreset: 'tealPaint', recessedLights: true });
    expect(a.wallPreset).toBe('tealPaint');
    expect(a.wallColor).toBe('#1f4f4f');
    expect(a.recessedLights).toBe(true);
    expect(a.floorPreset).toBe(DEFAULT_APPEARANCE.floorPreset);
  });

  it('accepts free wallColor while keeping plaster texture defaults', () => {
    const a = parseAppearance({ wallColor: '#6b7f6a' });
    expect(a.wallColor).toBe('#6b7f6a');
    expect(a.wallPreset).toBe(DEFAULT_APPEARANCE.wallPreset);
  });

  it('catalog preset uses teal paint color + concrete', () => {
    expect(CATALOG_APPEARANCE.wallColor).toBe('#1f4f4f');
    expect(CATALOG_APPEARANCE.floorPreset).toBe('concrete');
  });
});

describe('parseEnvironment', () => {
  it('tolerates missing fields and nests appearance', () => {
    const env = parseEnvironment({ timeOfDay: 12 });
    expect(env).not.toBeNull();
    expect(env!.timeOfDay).toBe(12);
    expect(env!.appearance.wallPreset).toBe(DEFAULT_APPEARANCE.wallPreset);
  });

  it('parses nested appearance', () => {
    const env = parseEnvironment({
      timeOfDay: 10,
      orientationDeg: 90,
      exposure: 1,
      skyMode: 'studio',
      appearance: { wallPreset: 'tealPaint' },
    });
    expect(env!.appearance.wallPreset).toBe('tealPaint');
    expect(env!.appearance.wallColor).toBe('#1f4f4f');
  });
});

describe('renderQuality', () => {
  it('high stays interactive-friendly (no SSAO / volumetrics)', () => {
    const q = resolveRenderQuality('high');
    expect(q.ao).toBe(false);
    expect(q.volumetrics).toBe(false);
    expect(q.dprCap).toBeLessThanOrEqual(1.5);
    expect(q.envDetail).toBe('standard');
  });

  it('presentation keeps orbit-fade capability and enables AO', () => {
    const q = resolveRenderQuality('presentation');
    expect(q.wallFade).toBe(true);
    expect(q.ao).toBe(true);
    expect(q.shadowMapSize).toBe(1024);
    expect(q.envDetail).toBe('full');
  });

  it('low is the cheapest interactive tier', () => {
    const q = resolveRenderQuality('low');
    expect(q.postProcessing).toBe(true);
    expect(q.postResolutionScale).toBeLessThan(0.5);
    expect(q.ao).toBe(false);
    expect(q.shadowMapSize).toBe(512);
    expect(q.envDetail).toBe('minimal');
    expect(q.ibl).toBe(false);
    expect(q.proceduralSky).toBe(false);
    expect(q.shadowUpdateEveryN).toBeGreaterThan(1);
  });

  it('balanced is lighter than high', () => {
    const b = resolveRenderQuality('balanced');
    const h = resolveRenderQuality('high');
    expect(b.dprCap).toBeLessThan(h.dprCap);
    expect(b.postResolutionScale).toBeLessThan(h.postResolutionScale);
    expect(b.richPost).toBe(false);
    expect(h.richPost).toBe(true);
    expect(b.windowShadows).toBe(false);
  });

  it('parseVisualSettings falls back safely', () => {
    expect(parseVisualSettings({})).toEqual(DEFAULT_VISUAL_SETTINGS);
    expect(parseVisualSettings({ quality: 'high' }).quality).toBe('high');
  });
});

describe('presentationCameras', () => {
  it('corner framing sits above eye height and looks into the room', () => {
    const f = framingForPreset(DEFAULT_ROOM_GEOMETRY, 'corner');
    expect(f.position[1]).toBeGreaterThan(40);
    expect(f.target[1]).toBeGreaterThan(0);
    expect(f.fov).toBeGreaterThan(20);
  });

  it('topDown is orthographic', () => {
    const f = framingForPreset(DEFAULT_ROOM_GEOMETRY, 'topDown');
    expect(f.orthographic).toBe(true);
    expect(f.orthoHalfExtent).toBeGreaterThan(50);
  });
});

describe('shapeUVs', () => {
  it('assigns UV attribute scaled by inches', () => {
    const geo = new THREE.PlaneGeometry(24, 48);
    applyFloorShapeUVs(geo, 1);
    const uv = geo.getAttribute('uv');
    expect(uv).toBeTruthy();
    expect(uv!.count).toBeGreaterThan(0);
  });

  it('wall slab UVs cover local X/Y', () => {
    const geo = new THREE.BoxGeometry(40, 96, 4);
    applyWallSlabUVs(geo, 1);
    expect(geo.getAttribute('uv')).toBeTruthy();
  });
});

describe('light shafts night gate', () => {
  it('isDaytime is false past sunset', async () => {
    const { isDaytime } = await import('./environment');
    expect(isDaytime(20.25)).toBe(false);
    expect(isDaytime(12)).toBe(true);
    expect(isDaytime(19.5)).toBe(true);
  });

  it('night sun intensity is moonlight-only (below shaft threshold)', async () => {
    const { sampleSun } = await import('./environment');
    const night = sampleSun(20.25, 0, { width: 120, depth: 160 });
    expect(night.intensity).toBeLessThan(0.12);
    const day = sampleSun(14, 0, { width: 120, depth: 160 });
    expect(day.intensity).toBeGreaterThan(0.12);
  });
});

describe('wallSlabs / buildWallGeometry', () => {
  it('splits around a door hole', () => {
    const slabs = wallSlabs(120, 96, [{ x: 0, y: 0, w: 32, h: 80 }]);
    expect(slabs.length).toBeGreaterThan(1);
    for (const s of slabs) {
      const coversHole =
        s.x0 < -10 && s.x1 > 10 && s.y0 < 10 && s.y1 > 40;
      expect(coversHole).toBe(false);
    }
  });

  it('buildWallGeometry returns a buffer with UVs', () => {
    const geo = buildWallGeometry(100, 96, [{ x: 10, y: 36, w: 36, h: 36 }]);
    expect(geo.getAttribute('position')).toBeTruthy();
    expect(geo.getAttribute('uv')).toBeTruthy();
    geo.dispose();
  });
});

describe('baseboard door gaps', () => {
  it('leaves a gap covering the door width plus pad', async () => {
    const { baseboardRunsForSegment, doorGapsForSegment } = await import('../scene/Baseboards');
    const { DEFAULT_ROOM_GEOMETRY, allWallSegments, doorOpenings } = await import('./roomGeometry');
    const geom = DEFAULT_ROOM_GEOMETRY;
    const doors = doorOpenings(geom);
    expect(doors.length).toBeGreaterThan(0);
    const door = doors[0]!;
    const segs = allWallSegments(geom).filter((s) => s.wall.id === door.wallId);
    expect(segs.length).toBe(1);
    const seg = segs[0]!;
    const gaps = doorGapsForSegment(geom, seg);
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.hi - gaps[0]!.lo).toBeGreaterThan(door.width);
    const runs = baseboardRunsForSegment(geom, seg);
    for (const run of runs) {
      const mid = (run.start + run.end) / 2;
      expect(mid < gaps[0]!.lo || mid > gaps[0]!.hi).toBe(true);
    }
  });
});
