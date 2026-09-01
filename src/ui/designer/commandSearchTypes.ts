import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import type { CuratedProduct } from '../../lib/dormChecklist';

/** Palette result sections (Hollis Hall order). */
export type SearchSection = 'add' | 'room' | 'actions';

/** Where a catalog/add result originated. */
export type SearchSource =
  | 'toova'
  | 'community'
  | 'mine'
  | 'checklist'
  | 'synthetic'
  | 'room'
  | 'action'
  | 'recent';

/** Optional filter scopes (typed prefix or chip). */
export type SearchScope =
  | 'all'
  | 'toova'
  | 'community'
  | 'mine'
  | 'room'
  | 'checklist'
  | 'actions';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SearchResultBase {
  id: string;
  label: string;
  section: SearchSection;
  source: SearchSource;
  /** Right-side meta (shortcut, checklist badge, source). */
  meta?: string;
  /** Soft disabled reason; row still visible when set. */
  disabledReason?: string;
  /** Ranking score (higher = better). */
  score: number;
  /** For match highlighting. */
  highlightRanges?: Array<{ start: number; end: number }>;
  run: () => void;
  /** Cmd/Ctrl+Enter when supported (place + edit). */
  runAndEdit?: () => void;
}

export interface CatalogModelResult extends SearchResultBase {
  type: 'catalogModel';
  model: GalleryModel;
  previewUrl?: string | null;
  thumbColor?: string;
  onChecklist?: boolean;
  alreadyInRoom?: boolean;
}

export interface ChecklistProductResult extends SearchResultBase {
  type: 'checklistProduct';
  product: CuratedProduct;
  previewUrl?: string | null;
  thumbColor?: string;
  placed?: boolean;
}

export interface RoomItemResult extends SearchResultBase {
  type: 'roomItem';
  itemId: string;
  kind: string;
}

export interface ActionResult extends SearchResultBase {
  type: 'action';
  /** Icon hint key for the palette. */
  icon?: 'light' | 'paint' | 'camera' | 'add' | 'look' | 'pieces' | 'help' | 'save' | 'share' | 'export' | 'dot';
  hint?: string;
}

export interface SyntheticToolResult extends SearchResultBase {
  type: 'syntheticTool';
  tool: 'string-lights' | 'hanging-leaves' | 'free-light';
  thumbColor?: string;
}

export type SearchResult =
  | CatalogModelResult
  | ChecklistProductResult
  | RoomItemResult
  | ActionResult
  | SyntheticToolResult;

export interface ScoredCandidate {
  id: string;
  label: string;
  searchable: string[];
  aliases?: string[];
  section: SearchSection;
  source: SearchSource;
  /** Exact catalog kind when applicable (for checklist/recent boosts). */
  kind?: string;
  /** Soft room-fit score 0..1 (1 = fits easily). */
  fit?: number;
  onChecklist?: boolean;
  alreadyInRoom?: boolean;
  recentIndex?: number;
  popularity?: number;
}

export interface RankOptions {
  query: string;
  checklistKinds?: Set<string>;
  recentKinds?: string[];
  /** Max results per section. */
  limits?: Partial<Record<SearchSection, number>>;
}

export interface DesignerSearchIntent {
  kind:
    | 'generic'
    | 'add'
    | 'toggle_lights'
    | 'wall_paint'
    | 'camera'
    | 'edit_selected'
    | 'select_kind';
  /** Parsed color label for wall paint. */
  colorLabel?: string;
  /** On/off for light toggle. */
  lightsOn?: boolean;
  /** Furniture kind hint (desk, lamp, …). */
  furnitureHint?: string;
  cameraPreset?: 'corner' | 'catalog' | 'topDown';
}
