import type { HangingDecorKind } from '../../../store';
import type { CatalogModel } from '../chromeTypes';

export type PlaceMethod = 'click' | 'drag' | 'try_keep' | 'essential';

/** Where a place originated — for analytics / toast context. */
export type PlaceContext =
  | 'grid'
  | 'for_you'
  | 'new'
  | 'recent'
  | 'pairs'
  | 'essentials';

export interface LibraryPanelSharedProps {
  compact?: boolean;
  onClose: () => void;
  onImport: () => void;
  onOpenModel: (model: CatalogModel) => void;
  onStartDraw: (kind: HangingDecorKind) => void;
  onStartMeasure: () => void;
  onAddLight: () => void;
  /** Platform admin — heal Toova photo thumbnails via admin RPC. */
  isAdmin?: boolean;
}

/** @deprecated Prefer LibraryPanelSharedProps; kept for any external imports. */
export type LibraryPanelProps = LibraryPanelSharedProps;

export const NEW_BADGE_DAYS = 14;
export const SHOWROOM_COACH_KEY = 'toova-showroom-coach';
