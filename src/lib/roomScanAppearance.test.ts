import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from './roomAppearance';
import {
  matchFloorPresetFromRgb,
  mergeScanAppearance,
  mergeScanAppearanceIntoEnvironment,
  parseManifestAppearance,
} from './roomScanAppearance';
import { MATERIAL_PRESETS } from './roomMaterials';

describe('roomScanAppearance', () => {
  it('matchFloorPresetFromRgb picks lightOak for pale wood tones', () => {
    const lightOak = MATERIAL_PRESETS.lightOak.color;
    const r = Number.parseInt(lightOak.slice(1, 3), 16);
    const g = Number.parseInt(lightOak.slice(3, 5), 16);
    const b = Number.parseInt(lightOak.slice(5, 7), 16);
    expect(matchFloorPresetFromRgb([r, g, b])).toBe('lightOak');
  });

  it('mergeScanAppearance prefers vision over sampled fields', () => {
    const merged = mergeScanAppearance(
      {
        wallColor: '#e8e4dc',
        floorPreset: 'lightOak',
        colorScheme: ['#e8e4dc', '#c4a574', '#1b4332'],
        rugColor: '#1b4332',
      },
      {
        wallColor: '#cccccc',
        floorPreset: 'concrete',
        rugColor: '#888888',
      },
    );
    expect(merged.wallColor).toBe('#e8e4dc');
    expect(merged.floorPreset).toBe('lightOak');
    expect(merged.rugColor).toBe('#1b4332');
  });

  it('mergeScanAppearanceIntoEnvironment applies wall and floor from scan', () => {
    const env = mergeScanAppearanceIntoEnvironment(
      DEFAULT_APPEARANCE,
      { floorPreset: 'darkOak', wallColor: '#d0ccc4' },
      ['#d0ccc4', '#8b6914', '#1a365d'],
    );
    expect(env.wallColor).toBe('#d0ccc4');
    expect(env.floorPreset).toBe('darkOak');
  });

  it('parseManifestAppearance reads twin-room fixture colors', () => {
    const appearance = parseManifestAppearance({
      wallColor: '#E5E0D8',
      floorPreset: 'lightOak',
      colorScheme: ['#E5E0D8', '#C9A962', '#1B4332', '#1A365D'],
      rugColor: '#1B4332',
      beddingColors: { blanket: '#1A365D', accent: '#1B4332' },
      floorPatternApproximated: true,
    });
    expect(appearance?.floorPreset).toBe('lightOak');
    expect(appearance?.colorScheme).toContain('#1b4332');
    expect(appearance?.beddingColors?.blanket).toBe('#1a365d');
    expect(appearance?.floorPatternApproximated).toBe(true);
  });
});
