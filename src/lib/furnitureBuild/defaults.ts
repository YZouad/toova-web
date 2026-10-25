import type { GalleryFurnitureKind } from '../../furniture/registry';
import type { ChairBack, ChairStyle, DeskPedestal, FurnitureBuild } from './types';

export type KindBuildDefaults = {
  drawers: number;
  columns: number;
  deskPedestal: DeskPedestal;
  shelves: number;
  bookshelfColumns: number;
  back: boolean;
  boards: number;
  gap: number;
  style: ChairStyle;
  backStyle: ChairBack;
};

export const KIND_BUILD_DEFAULTS: Record<
  Extract<
    GalleryFurnitureKind,
    'dresser' | 'nightstand' | 'desk' | 'bookshelf' | 'shelf' | 'chair'
  >,
  KindBuildDefaults
> = {
  dresser: {
    drawers: 3,
    columns: 1,
    deskPedestal: 'none',
    shelves: 3,
    bookshelfColumns: 1,
    back: true,
    boards: 1,
    gap: 8,
    style: 'side',
    backStyle: 'solid',
  },
  nightstand: {
    drawers: 1,
    columns: 1,
    deskPedestal: 'none',
    shelves: 3,
    bookshelfColumns: 1,
    back: true,
    boards: 1,
    gap: 8,
    style: 'side',
    backStyle: 'solid',
  },
  desk: {
    drawers: 3,
    columns: 1,
    deskPedestal: 'none',
    shelves: 3,
    bookshelfColumns: 1,
    back: true,
    boards: 1,
    gap: 8,
    style: 'side',
    backStyle: 'solid',
  },
  bookshelf: {
    drawers: 3,
    columns: 1,
    deskPedestal: 'none',
    shelves: 3,
    bookshelfColumns: 1,
    back: true,
    boards: 1,
    gap: 8,
    style: 'side',
    backStyle: 'solid',
  },
  shelf: {
    drawers: 1,
    columns: 1,
    deskPedestal: 'none',
    shelves: 3,
    bookshelfColumns: 1,
    back: true,
    boards: 1,
    gap: 8,
    style: 'side',
    backStyle: 'solid',
  },
  chair: {
    drawers: 1,
    columns: 1,
    deskPedestal: 'none',
    shelves: 3,
    bookshelfColumns: 1,
    back: true,
    boards: 1,
    gap: 8,
    style: 'side',
    backStyle: 'solid',
  },
};

export function defaultBuildForKind(kind: GalleryFurnitureKind): FurnitureBuild | undefined {
  if (!(kind in KIND_BUILD_DEFAULTS)) return undefined;
  const d = KIND_BUILD_DEFAULTS[kind as keyof typeof KIND_BUILD_DEFAULTS];
  switch (kind) {
    case 'dresser':
      return { drawers: 3, drawerRows: 3, drawerColumns: 1, columns: 1 };
    case 'nightstand':
      return { drawers: 1, drawerRows: 1, drawerColumns: 1, columns: 1 };
    case 'desk':
      return { deskPedestal: d.deskPedestal };
    case 'bookshelf':
      return { shelves: d.shelves, bookshelfColumns: d.bookshelfColumns, back: d.back };
    case 'shelf':
      return { boards: d.boards, gap: d.gap };
    case 'chair':
      return { style: d.style, backStyle: d.backStyle };
    default:
      return undefined;
  }
}
