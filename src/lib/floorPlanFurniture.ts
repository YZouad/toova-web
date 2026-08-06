/** Shared floor-plan furniture colors for room previews. */

export const KIND_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  wardrobe: '#A88457',
  desk: '#B5946C',
  chair: '#CBB28F',
  nightstand: '#C0A47A',
  lamp: '#D4C4A0',
  imported: '#7E8A60',
};

export const FALLBACK_FURNITURE_COLOR = '#CBB28F';

export function furnitureFill(kind: string): string {
  return KIND_COLORS[kind] ?? FALLBACK_FURNITURE_COLOR;
}

/**
 * One furniture piece as SVG markup, positioned in plan inches (x/z).
 * `tint` overrides the default kind fill (used for imported average colors).
 */
export function furniturePlanItemMarkup(opts: {
  kind: string;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  rotationDeg: number;
  stroke: number;
  tint?: string | null;
}): string {
  const { kind, cx, cz, width, depth, rotationDeg, stroke, tint } = opts;
  const fill = tint || furnitureFill(kind);
  const x = cx - width / 2;
  const y = cz - depth / 2;
  const transform = `rotate(${rotationDeg} ${cx} ${cz})`;
  const border = `stroke="rgba(43,38,32,0.18)" stroke-width="${stroke * 0.25}"`;

  return (
    `<rect x="${x}" y="${y}" width="${width}" height="${depth}" fill="${fill}" fill-opacity="0.88" ${border} transform="${transform}" />`
  );
}
