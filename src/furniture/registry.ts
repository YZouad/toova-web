export type FurnitureKind =
  | 'bed'
  | 'dresser'
  | 'wardrobe'
  | 'desk'
  | 'chair'
  | 'nightstand'
  | 'lamp'
  | 'imported'
  /** Procedural hanging garland / LED string — not in the furniture gallery. */
  | 'hanging';

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

export const FURNITURE: Record<Exclude<FurnitureKind, 'imported' | 'hanging'>, FurnitureDef> = {
  bed: {
    kind: 'bed',
    label: 'Twin Bed',
    // size[1] = frame+mattress body stack only; addItem/compute stores leg+body in Item.size[1]
    size: [38, 14, 75],
    clearance: 8,
    categories: ['beds'],
  },
  dresser: {
    kind: 'dresser',
    label: 'Dresser',
    size: [30, 32, 18],
    categories: ['storage'],
  },
  wardrobe: {
    kind: 'wardrobe',
    label: 'Wardrobe',
    size: [36, 72, 24],
    categories: ['storage'],
  },
  desk: {
    kind: 'desk',
    label: 'Desk',
    size: [48, 30, 24],
    clearance: 28.5,
    categories: ['desks_workspaces'],
  },
  chair: {
    kind: 'chair',
    label: 'Chair',
    size: [18, 36, 18],
    categories: ['seating'],
  },
  nightstand: {
    kind: 'nightstand',
    label: 'Nightstand',
    size: [18, 24, 18],
    categories: ['storage', 'beds'],
  },
  lamp: {
    kind: 'lamp',
    label: 'Lamp',
    size: [10, 22, 10],
    categories: ['lighting'],
  },
};
