import {
  planBounds,
  planCentroid,
  windowOpenings,
  doorOpenings,
  openingWorldPlacement,
  type RoomGeometry,
} from './roomGeometry';
import type { CameraPresetId } from './renderQuality';

export interface CameraFraming {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** When true, Scene should use an orthographic camera. */
  orthographic?: boolean;
  /** Orthographic half-extent (inches) when orthographic. */
  orthoHalfExtent?: number;
}

/** Eye-height (~60″) corner view — IKEA cutaway feel. */
export function framingForPreset(
  geom: RoomGeometry,
  preset: CameraPresetId,
): CameraFraming {
  const b = planBounds(geom);
  const [cx, cz] = planCentroid(geom);
  const span = Math.max(b.width, b.depth);
  const eyeY = Math.min(geom.height * 0.72, 62);

  switch (preset) {
    case 'catalog': {
      return {
        position: [cx + span * 0.95, span * 0.62, cz + span * 1.05],
        target: [cx, geom.height * 0.35, cz],
        fov: 38,
      };
    }
    case 'window': {
      // Standing walk-in: look across the room toward a window, or in from the door.
      const windows = windowOpenings(geom);
      const doors = doorOpenings(geom);
      let outward: [number, number, number] = [0, 0, 1];
      if (windows.length > 0) {
        const p = openingWorldPlacement(geom, windows[0]!);
        if (p) outward = p.outward;
      } else if (doors.length > 0) {
        const p = openingWorldPlacement(geom, doors[0]!);
        if (p) outward = [-p.outward[0], 0, -p.outward[2]];
      }
      const dist = span * 0.48;
      const side = span * 0.14;
      const rightX = -outward[2];
      const rightZ = outward[0];
      return {
        position: [
          cx - outward[0] * dist + rightX * side,
          eyeY,
          cz - outward[2] * dist + rightZ * side,
        ],
        target: [
          cx + outward[0] * (span * 0.18),
          40,
          cz + outward[2] * (span * 0.18),
        ],
        fov: 50,
      };
    }
    case 'topDown': {
      const half = Math.max(b.width, b.depth) * 0.55 + 20;
      return {
        position: [cx, Math.max(span * 1.4, geom.height * 2.2), cz],
        target: [cx, 0, cz],
        fov: 35,
        orthographic: true,
        orthoHalfExtent: half,
      };
    }
    case 'corner':
    default: {
      return {
        position: [cx + span * 0.85, eyeY + span * 0.12, cz + span * 1.05],
        target: [cx, 36, cz],
        fov: 35,
      };
    }
  }
}

/** Default orbit framing used by Scene on load (matches prior behavior, slightly higher target). */
export function defaultOrbitFraming(geom: RoomGeometry): CameraFraming {
  return framingForPreset(geom, 'corner');
}
