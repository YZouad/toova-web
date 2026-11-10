import {
  planBounds,
  planCentroid,
  windowOpenings,
  doorOpenings,
  openingWorldPlacement,
  type RoomGeometry,
} from './roomGeometry';
import type { CameraPresetId } from './renderQuality';
import type { ApartmentRoom } from './apartmentRooms';

export interface CameraFraming {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** When true, Scene should use an orthographic camera. */
  orthographic?: boolean;
  /** Orthographic half-extent (inches) when orthographic. */
  orthoHalfExtent?: number;
}

/** Bounds helper for a face polygon (plan inches). */
function faceBounds(face: { x: number; z: number }[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  cx: number;
  cz: number;
} {
  const xs = face.map((v) => v.x);
  const zs = face.map((v) => v.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  };
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

/** Corner framing fitted to one apartment room's face (used after focus). */
export function framingForArea(
  geom: RoomGeometry,
  room: ApartmentRoom,
  preset: CameraPresetId = 'corner',
): CameraFraming {
  const b = faceBounds(room.face);
  const [ax, az] = room.labelAnchor;
  const cx = pointInApprox(ax, az, b) ? ax : b.cx;
  const cz = pointInApprox(ax, az, b) ? az : b.cz;
  const span = Math.max(b.width, b.depth);
  const eyeY = Math.min(geom.height * 0.72, 62);

  switch (preset) {
    case 'catalog':
      return {
        position: [cx + span * 0.95, span * 0.62, cz + span * 1.05],
        target: [cx, geom.height * 0.35, cz],
        fov: 38,
      };
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
    case 'window':
    case 'corner':
    default:
      return {
        position: [cx + span * 0.85, eyeY + span * 0.12, cz + span * 1.05],
        target: [cx, 36, cz],
        fov: 35,
      };
  }
}

function pointInApprox(
  x: number,
  z: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

/** Elevated angled overview of the whole apartment (dollhouse). */
export function dollhouseFraming(geom: RoomGeometry): CameraFraming {
  const b = planBounds(geom);
  const [cx, cz] = planCentroid(geom);
  const fov = 42;
  const target: [number, number, number] = [cx, geom.height * 0.15, cz];
  // Keep the prior viewing direction; scale distance so the plan diagonal fits.
  const dirX = 0.55;
  const dirY = 1.15;
  const dirZ = 0.7;
  const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
  const radius = 0.5 * Math.hypot(b.width, b.depth);
  const halfFovRad = ((fov / 2) * Math.PI) / 180;
  const distance = (radius / Math.sin(halfFovRad)) * 1.15;
  const scale = distance / dirLen;
  return {
    position: [target[0] + dirX * scale, target[1] + dirY * scale, target[2] + dirZ * scale],
    target,
    fov,
  };
}
