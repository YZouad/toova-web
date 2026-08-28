export type FurnitureKind =
  | 'bed'
  | 'dresser'
  | 'bookshelf'
  | 'shelf'
  | 'wardrobe'
  | 'desk'
  | 'chair'
  | 'nightstand'
  | 'lamp'
  | 'imported'
  /** Procedural hanging garland / LED string — not in the furniture gallery. */
  | 'hanging'
  /** Free-floating light source — not in the furniture gallery. */
  | 'light';

export type GalleryFurnitureKind = Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>;

export interface FurnitureDef {
  kind: FurnitureKind;
  label: string;
  // size at rotation=0: [width(X), height(Y), depth(Z)] in inches
  size: [number, number, number];
  // For host items (bed, desk): clearance between floor and underside.
  // Bed: underside of frame is item.position[1] + bedLegHeight (legs only below frame).
  clearance?: number;
  /** Preset gallery category slugs (max 3). */
  categories?: string[];
}

/** Default gizmo size for free-floating light sources (inches). */
export const LIGHT_SOURCE_SIZE: [number, number, number] = [1.6, 1.6, 1.6];

export const FURNITURE: Record<GalleryFurnitureKind, FurnitureDef> = {
  bed: {
    kind: 'bed',
    label: 'Twin Bed',
    // size[1] = frame+mattress body stack only; addItem/compute stores leg+body in Item.size[1]
    size: [38, 14, 75],
    clearance: 8,
    categories: ['beds'],
  },
  desk: {
    kind: 'desk',
    label: 'Desk',
    size: [48, 30, 24],
    clearance: 28.5,
    categories: ['desks_workspaces'],
  },
  wardrobe: {
    kind: 'wardrobe',
    label: 'Wardrobe',
    size: [36, 72, 24],
    categories: ['storage'],
  },
  bookshelf: {
    kind: 'bookshelf',
    label: 'Bookshelf',
    size: [30, 32, 18],
    categories: ['storage'],
  },
  shelf: {
    kind: 'shelf',
    label: 'Wall Shelf',
    // Thin board parallel to the floor: width × thickness × depth.
    size: [36, 1.5, 10],
    categories: ['storage', 'decor_art'],
  },
  dresser: {
    kind: 'dresser',
    label: 'Dresser',
    size: [30, 32, 18],
    categories: ['storage'],
  },
  nightstand: {
    kind: 'nightstand',
    label: 'Nightstand',
    size: [18, 24, 18],
    categories: ['storage', 'beds'],
  },
  chair: {
    kind: 'chair',
    label: 'Chair',
    size: [18, 36, 18],
    categories: ['seating'],
  },
  lamp: {
    kind: 'lamp',
    label: 'Lamp',
    size: [10, 22, 10],
    categories: ['lighting'],
  },
};

/** True for the floating wall shelf — keeps elevation (does not fall to the floor). */
export function isWallShelfKind(kind: FurnitureKind): boolean {
  return kind === 'shelf';
}

export const DEFAULT_SHELF_COLOR = '#a98662';

export const SHELF_COLOR_SWATCHES: { label: string; color: string }[] = [
  { label: 'Oak', color: '#a98662' },
  { label: 'Light oak', color: '#c4a574' },
  { label: 'Walnut', color: '#6b4f33' },
  { label: 'White', color: '#f2efe8' },
  { label: 'Sage', color: '#6b7f6a' },
  { label: 'Charcoal', color: '#3a3a3a' },
];
