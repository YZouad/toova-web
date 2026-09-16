import type { FurnitureKind } from '../furniture/registry';
import { DEFAULT_SHELF_COLOR } from '../furniture/registry';

/** Built-in wood pieces that can take a tint and a photo wrap. */
export const CUSTOM_FINISH_KINDS = [
  'wardrobe',
  'dresser',
  'nightstand',
  'desk',
  'bookshelf',
  'shelf',
  'chair',
  'bed',
] as const satisfies readonly FurnitureKind[];

export type CustomFinishKind = (typeof CUSTOM_FINISH_KINDS)[number];

export const FURNITURE_FINISH_SWATCHES: { label: string; color: string }[] = [
  { label: 'Oak', color: '#a98662' },
  { label: 'Warm oak', color: '#8a6f52' },
  { label: 'Light oak', color: '#c4a574' },
  { label: 'Walnut', color: '#6b4f33' },
  { label: 'Gray laminate', color: '#5c6166' },
  { label: 'Charcoal', color: '#3a3a3a' },
  { label: 'White', color: '#f2efe8' },
  { label: 'Sage', color: '#6b7f6a' },
  { label: 'Slate', color: '#4a5a6c' },
];

export function itemUsesCustomFinish(kind: FurnitureKind): kind is CustomFinishKind {
  return (CUSTOM_FINISH_KINDS as readonly string[]).includes(kind);
}

export function itemUsesTintColor(kind: FurnitureKind): boolean {
  return kind === 'imported' || itemUsesCustomFinish(kind);
}

export function defaultFinishColor(kind: FurnitureKind): string {
  switch (kind) {
    case 'wardrobe':
      return '#8a6f52';
    case 'desk':
      return '#8a6440';
    case 'chair':
      return '#4a5a6c';
    case 'shelf':
      return DEFAULT_SHELF_COLOR;
    case 'bed':
      return '#6b4f33';
    default:
      return '#a98662';
  }
}

type FinishItem = {
  kind: FurnitureKind;
  tintColor?: string;
  blanketTexturePath?: string;
  blanketTextureUrl?: string;
  finishTexturePath?: string;
  finishTextureUrl?: string;
};

export const DEFAULT_MATTRESS_COLOR = '#f1ece1';

export const MATTRESS_COLOR_SWATCHES: { label: string; color: string }[] = [
  { label: 'Cream', color: '#f1ece1' },
  { label: 'White', color: '#f7f4ee' },
  { label: 'Cloud', color: '#d5d8df' },
  { label: 'Charcoal', color: '#4a4a4a' },
  { label: 'Navy', color: '#2c3a4f' },
  { label: 'Sage', color: '#7a8b73' },
  { label: 'Blush', color: '#e4cfc8' },
];

export function mattressColor(hex?: string): string {
  return hex ?? DEFAULT_MATTRESS_COLOR;
}

export function itemUsesTopColor(kind: FurnitureKind): boolean {
  return kind === 'dresser';
}

/** Dresser top matches the base until the user picks a separate color. */
export function dresserTopColor(hex: string | undefined, bodyColor: string): string {
  return hex ?? bodyColor;
}

export function finishColor(item: Pick<FinishItem, 'kind' | 'tintColor'>, fallback?: string): string {
  return item.tintColor ?? fallback ?? defaultFinishColor(item.kind);
}

export function shadeHex(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6) return hex;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const ch = (shift: number) =>
    Math.max(0, Math.min(255, ((n >> shift) & 255) + amount))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Storage paths that should be signed for this item's photo textures. */
export function storedTexturePaths(item: Pick<FinishItem, 'kind' | 'blanketTexturePath' | 'finishTexturePath'>): string[] {
  const paths: string[] = [];
  if (item.kind === 'bed' && item.blanketTexturePath) paths.push(item.blanketTexturePath);
  if (itemUsesCustomFinish(item.kind) && item.finishTexturePath) paths.push(item.finishTexturePath);
  return paths;
}

export function texturePathsToSign(item: FinishItem): string[] {
  const paths: string[] = [];
  if (item.kind === 'bed' && item.blanketTexturePath && !item.blanketTextureUrl) {
    paths.push(item.blanketTexturePath);
  }
  if (itemUsesCustomFinish(item.kind) && item.finishTexturePath && !item.finishTextureUrl) {
    paths.push(item.finishTexturePath);
  }
  return paths;
}

export function assignSignedTextureUrl(item: FinishItem, path: string, url: string): void {
  if (item.blanketTexturePath === path) item.blanketTextureUrl = url;
  if (item.finishTexturePath === path) item.finishTextureUrl = url;
}
