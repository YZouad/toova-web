/** Default builtin lamp is 10 × 22 × 10; stem is the leftover after base + shade. */
export const LAMP_ARM_MIN = 4;
export const LAMP_ARM_MAX = 56;

export interface LampParts {
  baseH: number;
  stemH: number;
  shadeH: number;
  shadeW: number;
  stemR: number;
  baseR: number;
}

function footprintOf(size: [number, number, number]): number {
  return Math.min(size[0], size[2]);
}

/** Base and shade stay tied to footprint so height only changes the stem. */
export function lampFixedParts(size: [number, number, number]): {
  baseH: number;
  shadeH: number;
  shadeW: number;
  stemR: number;
  baseR: number;
} {
  const footprint = footprintOf(size);
  return {
    baseH: Math.max(1.2, footprint * 0.18),
    shadeH: Math.max(2.5, footprint * 0.7),
    shadeW: footprint * 0.95,
    stemR: footprint * 0.08,
    baseR: footprint * 0.4,
  };
}

export function lampMinHeight(size: [number, number, number]): number {
  const { baseH, shadeH } = lampFixedParts(size);
  return baseH + LAMP_ARM_MIN + shadeH;
}

export function lampPartsFromSize(size: [number, number, number]): LampParts {
  const fixed = lampFixedParts(size);
  const stemH = Math.max(LAMP_ARM_MIN, size[1] - fixed.baseH - fixed.shadeH);
  return { ...fixed, stemH };
}

export function lampSizeFromArmHeight(
  size: [number, number, number],
  armH: number,
): [number, number, number] {
  const { baseH, shadeH } = lampFixedParts(size);
  const stemH = Math.max(LAMP_ARM_MIN, Math.min(LAMP_ARM_MAX, armH));
  return [size[0], baseH + stemH + shadeH, size[2]];
}

export function lampArmMaxForRoom(size: [number, number, number], roomHeight: number): number {
  const { stemH } = lampPartsFromSize(size);
  return Math.min(LAMP_ARM_MAX, Math.max(LAMP_ARM_MIN, roomHeight - size[1] + stemH));
}
