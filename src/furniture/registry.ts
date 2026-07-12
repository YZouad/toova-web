export type FurnitureKind = 'bed' | 'dresser' | 'wardrobe' | 'desk' | 'chair' | 'nightstand' | 'imported';

export interface FurnitureDef {
  kind: FurnitureKind;
  label: string;
  // size at rotation=0: [width(X), height(Y), depth(Z)] in inches
  size: [number, number, number];
  // For host items (bed, desk): clearance between floor and underside.
  // Bed: underside of frame is item.position[1] + bedLegHeight (legs only below frame).
  clearance?: number;
}

export const FURNITURE: Record<Exclude<FurnitureKind, 'imported'>, FurnitureDef> = {
  bed: {
    kind: 'bed',
    label: 'Twin Bed',
    // size[1] = frame+mattress body stack only; addItem/compute stores leg+body in Item.size[1]
    size: [38, 14, 75],
    clearance: 8,
  },
  dresser: {
    kind: 'dresser',
    label: 'Dresser',
    size: [30, 32, 18],
  },
  wardrobe: {
    kind: 'wardrobe',
    label: 'Wardrobe',
    size: [36, 72, 24],
  },
  desk: {
    kind: 'desk',
    label: 'Desk',
    size: [48, 30, 24],
    clearance: 28.5,
  },
  chair: {
    kind: 'chair',
    label: 'Chair',
    size: [18, 36, 18],
  },
  nightstand: {
    kind: 'nightstand',
    label: 'Nightstand',
    size: [18, 24, 18],
  },
};
