import type { CameraPresetId } from '../../store';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';

/** Gallery card / placeable catalog entry (alias used by designer panels). */
export type CatalogModel = GalleryModel;

/** Primary left-rail / dock panels (mutually exclusive with import overlay). */
export type DesignerPanel =
  | null
  | 'add'
  | 'look'
  | 'light'
  | 'pieces'
  | 'inspect';

export type DesignerOverlay = null | 'cmdk' | 'keys' | 'more';

export type ImportRoute = null | 'upload' | 'photo' | 'poster';

export type InspectorTab =
  | 'fit'
  | 'bedding'
  | 'finish'
  | 'path'
  | 'bulbs'
  | 'light';

/** View puck labels mapped onto existing camera presets. */
export const VIEW_PRESETS: { id: CameraPresetId; label: string }[] = [
  { id: 'corner', label: 'Room' },
  { id: 'catalog', label: 'Desk' },
  { id: 'topDown', label: 'Top' },
];

/** DOM targets for the walkthrough spotlight (`data-tour-id`). */
export type TourTargetId =
  | 'viewport'
  | 'rail-add'
  | 'dock-add'
  | 'ticker'
  | 'camera'
  | 'context'
  | 'topbar-save';

export type TourCardPlacement = 'auto' | 'right' | 'left' | 'top' | 'bottom' | 'center';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Desktop spotlight target. Null = soft dim only (no cutout). */
  target: TourTargetId | null;
  /** Compact / phone spotlight target (falls back to `target`). */
  compactTarget?: TourTargetId | null;
  placement?: TourCardPlacement;
  /** Preferred card side on phone; falls back to `placement` then auto. */
  compactPlacement?: TourCardPlacement;
  /** Select the first room item when entering this step. */
  selectFirst?: boolean;
  /** Expand the checklist ticker when entering this step. */
  openTicker?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'room',
    title: 'This is your room',
    body: 'Everything you place lives here in 3D. Drag to look around later. First learn the tools around the edges.',
    target: null,
    placement: 'center',
  },
  {
    id: 'add',
    title: 'Add pieces from here',
    body: 'Open Add to browse Toova models, community uploads, or import your own. That is how furniture gets into the room.',
    target: 'rail-add',
    compactTarget: 'dock-add',
    placement: 'right',
    compactPlacement: 'top',
  },
  {
    id: 'checklist',
    title: 'The checklist keeps score',
    body: 'Open it anytime to see what is still to place, shop options, and a running total. Placing a matching piece ticks it off.',
    target: 'ticker',
    compactTarget: 'ticker',
    placement: 'left',
    compactPlacement: 'bottom',
    openTicker: true,
  },
  {
    id: 'select',
    title: 'Click a piece to edit it',
    body: 'The bar at the bottom is for size, height, rotate, duplicate, and remove. Edit details opens finer controls.',
    target: 'context',
    compactTarget: 'context',
    placement: 'top',
    compactPlacement: 'top',
    selectFirst: true,
  },
  {
    id: 'camera',
    title: 'Change your view',
    body: 'Use Room, Desk, or Top for a quick angle. Drag the room to orbit, scroll to zoom, and Reset if you get lost.',
    target: 'camera',
    placement: 'top',
    compactPlacement: 'bottom',
  },
  {
    id: 'save',
    title: 'Save when you like it',
    body: 'Your layout saves as you go. When you are ready, Present for a clean look, or share and export from the top bar.',
    target: 'topbar-save',
    compactTarget: 'topbar-save',
    placement: 'bottom',
    compactPlacement: 'bottom',
  },
];

export const TOUR_STORAGE_KEY = 'toova-designer-tour-v3';

export const COMPACT_MQ = '(max-width: 1023px)';
