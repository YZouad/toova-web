import { COMFORTER_COLORS, SHEET_COLORS } from '../bedding/catalog';
import type { BeddingColor } from '../bedding/types';

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

export function nearestBeddingColorId(hex: string, catalog: BeddingColor[]): string {
  let best = catalog[0]!;
  let bestDist = Infinity;
  for (const c of catalog) {
    const d = colorDistance(hex, c.hex);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best.id;
}

export function nearestSheetColorId(hex: string): string {
  return nearestBeddingColorId(hex, SHEET_COLORS);
}

export function nearestComforterColorId(hex: string): string {
  return nearestBeddingColorId(hex, COMFORTER_COLORS);
}
