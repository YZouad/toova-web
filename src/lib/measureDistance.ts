/** World-space point in inches (designer room coordinates). */
export type MeasureVec3 = [number, number, number];

export type MeasureAcceptField = 'width' | 'height' | 'depth' | 'clearance';

export interface MeasureDistances {
  /** Straight-line distance between the two points. */
  diagonal3d: number;
  /** Floor-plane span sqrt(dx² + dz²). */
  horizontal: number;
  /** Vertical span |dy|. */
  vertical: number;
  /** Absolute delta on each axis (for standalone readout). */
  width: number;
  height: number;
  depth: number;
}

export function measureDistances(a: MeasureVec3, b: MeasureVec3): MeasureDistances {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return {
    diagonal3d: Math.sqrt(dx * dx + dy * dy + dz * dz),
    horizontal: Math.sqrt(dx * dx + dz * dz),
    vertical: Math.abs(dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
    depth: Math.abs(dz),
  };
}

/** Inch value written into import dimension fields on Accept. */
export function measureValueForField(
  a: MeasureVec3,
  b: MeasureVec3,
  field: MeasureAcceptField,
): number {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  if (field === 'width') return dx;
  if (field === 'depth') return dz;
  if (field === 'height') return dy;
  if (field === 'clearance') return Math.sqrt(dx * dx + dz * dz);
  return measureDistances(a, b).diagonal3d;
}

/**
 * Inches written into an import field on Accept.
 * Same number as the labeled field value: width |dx|, depth |dz|, height |dy|,
 * clearance the floor span.
 */
export function measureImportAcceptInches(
  a: MeasureVec3,
  b: MeasureVec3,
  field: MeasureAcceptField,
): number {
  return measureValueForField(a, b, field);
}

export function formatMeasureInches(inches: number): string {
  const rounded = Math.round(inches * 10) / 10;
  return String(rounded);
}

export function measureFieldLabel(field: MeasureAcceptField): string {
  if (field === 'width') return 'Width';
  if (field === 'height') return 'Height';
  if (field === 'depth') return 'Depth';
  return 'Clearance';
}

export function measureFieldHint(field: MeasureAcceptField): string {
  if (field === 'width') return 'Pick points side-to-side';
  if (field === 'depth') return 'Pick points front-to-back';
  if (field === 'height') return 'Pick points bottom-to-top';
  return 'Pick points on the floor plane';
}

export type MeasureDominantAxis = 'width' | 'depth' | 'height' | 'multi';

export interface MeasureReadout {
  primary: string;
  secondary: string | null;
  dominant: MeasureDominantAxis;
}

const AXIS_NEARLY_ZERO_IN = 2;
const AXIS_DOMINANT_SHARE = 0.85;

export function dominantMeasureAxis(a: MeasureVec3, b: MeasureVec3): MeasureDominantAxis {
  const d = measureDistances(a, b);
  const axes: Array<{ key: Exclude<MeasureDominantAxis, 'multi'>; value: number }> = [
    { key: 'width', value: d.width },
    { key: 'depth', value: d.depth },
    { key: 'height', value: d.height },
  ];
  axes.sort((x, y) => y.value - x.value);
  const best = axes[0]!;
  const rest = axes.slice(1);
  if (best.value < 0.05) return 'multi';
  const othersNearlyZero = rest.every((axis) => axis.value < AXIS_NEARLY_ZERO_IN);
  const share = d.diagonal3d > 0.05 ? best.value / d.diagonal3d : 0;
  if (othersNearlyZero || share >= AXIS_DOMINANT_SHARE) return best.key;
  return 'multi';
}

/** Live readout: straight-line distance between the two points. */
export function formatMeasureReadout(
  a: MeasureVec3,
  b: MeasureVec3,
  format: (inches: number) => string,
  acceptField: MeasureAcceptField | null = null,
): MeasureReadout {
  const d = measureDistances(a, b);
  const breakdown = `W ${format(d.width)} · D ${format(d.depth)} · H ${format(d.height)}`;

  if (acceptField) {
    const fieldValue = measureValueForField(a, b, acceptField);
    return {
      primary: `Distance ${format(d.diagonal3d)}`,
      secondary: `${measureFieldLabel(acceptField)} ${format(fieldValue)} · ${breakdown}`,
      dominant: 'multi',
    };
  }

  return {
    primary: `Distance ${format(d.diagonal3d)}`,
    secondary: breakdown,
    dominant: dominantMeasureAxis(a, b),
  };
}
