import type { BeddingColor, BeddingPattern, PillowSizeId } from './types';

export const SHEET_COLORS: BeddingColor[] = [
  { id: 'white', label: 'White', hex: '#f5f2eb' },
  { id: 'beige', label: 'Beige', hex: '#d8d0c2' },
  { id: 'gray', label: 'Gray', hex: '#9aa0a8' },
  { id: 'blue', label: 'Blue', hex: '#6b8cae' },
];

export const SHEET_PATTERNS: BeddingPattern[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'striped', label: 'Striped' },
  { id: 'checkered', label: 'Checkered' },
  { id: 'floral', label: 'Floral' },
];

export const COMFORTER_COLORS: BeddingColor[] = [
  { id: 'white', label: 'White', hex: '#f5f2eb' },
  { id: 'cream', label: 'Cream', hex: '#f0e6d2' },
  { id: 'gray', label: 'Gray', hex: '#8a9098' },
  { id: 'navy', label: 'Navy', hex: '#2c3e5c' },
  { id: 'sage', label: 'Sage', hex: '#8fa88a' },
];

export const COMFORTER_PATTERNS: BeddingPattern[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'plaid', label: 'Plaid' },
  { id: 'striped', label: 'Striped' },
  { id: 'floral', label: 'Floral' },
];

/** Pillow colors/patterns reuse sheet catalogs for now. */
export const PILLOW_COLORS = SHEET_COLORS;
export const PILLOW_PATTERNS = SHEET_PATTERNS;

export const PILLOW_SIZES: Record<
  PillowSizeId,
  { label: string; width: number; height: number; depth: number }
> = {
  decorative: { label: 'Small / Decorative', width: 16, height: 4.5, depth: 20 },
  standard: { label: 'Standard', width: 20, height: 5, depth: 26 },
  queen: { label: 'Queen', width: 20, height: 5, depth: 30 },
  king: { label: 'King', width: 20, height: 5.5, depth: 36 },
  euro: { label: 'Euro', width: 26, height: 5, depth: 26 },
};

export const DEFAULT_SHEET_COLOR_ID = 'white';
export const DEFAULT_SHEET_PATTERN_ID = 'solid';
export const DEFAULT_COMFORTER_COLOR_ID = 'cream';
export const DEFAULT_COMFORTER_PATTERN_ID = 'solid';
export const DEFAULT_PILLOW_COLOR_ID = 'white';
export const DEFAULT_PILLOW_PATTERN_ID = 'solid';
export const DEFAULT_PILLOW_SIZE: PillowSizeId = 'standard';

export function findColor(
  colors: BeddingColor[],
  id: string | undefined,
  fallbackId: string,
): BeddingColor {
  return colors.find((c) => c.id === id) ?? colors.find((c) => c.id === fallbackId) ?? colors[0];
}

export function findPattern(
  patterns: BeddingPattern[],
  id: string | undefined,
  fallbackId: string,
): BeddingPattern {
  return patterns.find((p) => p.id === id) ?? patterns.find((p) => p.id === fallbackId) ?? patterns[0];
}
