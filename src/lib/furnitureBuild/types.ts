import type { GalleryFurnitureKind } from '../../furniture/registry';

/** Side pedestal cabinets (can combine with deskPullOut). */
export type DeskPedestalSide = 'none' | 'left' | 'right' | 'both';

/** @deprecated use DeskPedestalSide + DeskPullOut */
export type DeskPedestal = DeskPedestalSide | 'center' | 'front';

/** Pull-out pencil drawer under the desktop (works with side cabinets). */
export type DeskPullOut = 'none' | 'front' | 'center';

/** Open corner legs vs thin side panels down to the floor. */
export type DeskBase = 'legs' | 'panels';
export type ChairStyle = 'side' | 'armchair' | 'stool';
export type ChairBack = 'solid' | 'slats';
/** Tall stack, one horizontal row, or rows × columns grid. */
export type DrawerArrangement = 'stack' | 'wide' | 'grid';

/** Per-piece procedural structure; omitted fields use kind defaults. */
export type FurnitureBuild = {
  /** Drawer count (= drawerRows × drawerColumns when grid fields are set). */
  drawers?: number;
  /** Vertical drawer rows (dresser / nightstand / desk bank). */
  drawerRows?: number;
  /** Horizontal drawer columns per row. */
  drawerColumns?: number;
  /** @deprecated use drawerColumns */
  columns?: number;
  drawerArrangement?: DrawerArrangement;
  /** Relative drawer face heights (same length as drawer rows per column). */
  heights?: number[];
  deskPedestal?: DeskPedestal;
  deskPullOut?: DeskPullOut;
  /** Under-drawer size (inches). */
  pullOutWidthIn?: number;
  pullOutDepthIn?: number;
  pullOutHeightIn?: number;
  /** Side support when the knee well is open (default legs). */
  deskBase?: DeskBase;
  /** Thin panel across the back (modesty / enclosure). */
  deskBackPanel?: boolean;
  /** Horizontal shelf bays (bookshelf). */
  shelves?: number;
  /** Vertical divisions (bookshelf). */
  bookshelfColumns?: number;
  back?: boolean;
  /** Stacked wall boards. */
  boards?: number;
  gap?: number;
  style?: ChairStyle;
  backStyle?: ChairBack;
  widthIn?: number;
  heightIn?: number;
  depthIn?: number;
};

export type ResolvedFurnitureBuild = Required<
  Pick<FurnitureBuild, never>
> &
  FurnitureBuild;

export const BUILD_KINDS: GalleryFurnitureKind[] = [
  'dresser',
  'nightstand',
  'desk',
  'bookshelf',
  'shelf',
  'chair',
];

export function kindSupportsBuild(kind: string): kind is GalleryFurnitureKind {
  return (BUILD_KINDS as string[]).includes(kind);
}
