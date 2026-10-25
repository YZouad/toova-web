import type { MaterialPresetId } from '../roomMaterials';
import { normalizeHexColor } from '../agenticColorScheme';

export type RevisePlacementHint =
  | 'center'
  | 'window'
  | 'bed'
  | 'desk'
  | 'selected';

export interface ReviseItemTarget {
  itemId?: string;
  kind?: string;
  labelContains?: string;
  useSelection?: boolean;
}

export type ReviseAction =
  | { type: 'paint_wall'; color: string; wallId?: string | 'all' }
  | {
      type: 'set_appearance';
      floorPreset?: MaterialPresetId;
      trimPreset?: MaterialPresetId;
      showBaseboards?: boolean;
    }
  | { type: 'set_curtains'; color: string; openingId?: string }
  | { type: 'apply_color_scheme'; colors: string[] }
  | {
      type: 'set_item_color';
      target: ReviseItemTarget;
      field: 'tint' | 'mattress' | 'top' | 'drawer' | 'blanket';
      color: string;
    }
  | {
      type: 'set_bedding';
      target: ReviseItemTarget;
      sheetColor?: string;
      comforterColor?: string;
    }
  | { type: 'remove_item'; target: ReviseItemTarget }
  | { type: 'duplicate_item'; target: ReviseItemTarget }
  | { type: 'move_item'; target: ReviseItemTarget; placement: RevisePlacementHint }
  | { type: 'rotate_item'; target: ReviseItemTarget; rotationY: number }
  | { type: 'add_item'; query: string; placement?: RevisePlacementHint };

const FLOOR_PRESETS = new Set<MaterialPresetId>([
  'warmPlaster',
  'coolPlaster',
  'tealPaint',
  'whiteCeiling',
  'concrete',
  'lightOak',
  'darkOak',
  'carpet',
  'charcoalCarpet',
  'greySpeckleCarpet',
  'oatmealCarpet',
  'plaidCarpet',
  'whiteTrim',
  'blackTrim',
]);

const ACTION_TYPES = new Set([
  'paint_wall',
  'set_appearance',
  'set_curtains',
  'apply_color_scheme',
  'set_item_color',
  'set_bedding',
  'remove_item',
  'duplicate_item',
  'move_item',
  'rotate_item',
  'add_item',
]);

function parseTarget(raw: unknown): ReviseItemTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const target: ReviseItemTarget = {};
  if (typeof o.itemId === 'string' && o.itemId.trim()) target.itemId = o.itemId.trim();
  if (typeof o.kind === 'string' && o.kind.trim()) target.kind = o.kind.trim().toLowerCase();
  if (typeof o.labelContains === 'string' && o.labelContains.trim()) {
    target.labelContains = o.labelContains.trim();
  }
  if (o.useSelection === true || o.selection === 'selected') target.useSelection = true;
  if (!target.itemId && !target.kind && !target.labelContains && !target.useSelection) {
    return null;
  }
  return target;
}

function parsePlacement(raw: unknown): RevisePlacementHint | undefined {
  if (typeof raw !== 'string') return undefined;
  const p = raw.trim().toLowerCase();
  if (p === 'center' || p === 'window' || p === 'bed' || p === 'desk' || p === 'selected') {
    return p;
  }
  return undefined;
}

function parseHexList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const colors = raw
    .map((v) => (typeof v === 'string' ? normalizeHexColor(v) : null))
    .filter((c): c is string => !!c);
  return colors.length ? colors : null;
}

function parseOneAction(raw: unknown): ReviseAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = typeof o.type === 'string' ? o.type.trim() : '';
  if (!ACTION_TYPES.has(type)) return null;

  switch (type) {
    case 'paint_wall': {
      const color = typeof o.color === 'string' ? normalizeHexColor(o.color) : null;
      if (!color) return null;
      const wallId =
        o.wallId === 'all'
          ? 'all'
          : typeof o.wallId === 'string' && o.wallId.trim()
            ? o.wallId.trim()
            : undefined;
      return { type: 'paint_wall', color, wallId };
    }
    case 'set_appearance': {
      const floorPreset =
        typeof o.floorPreset === 'string' && FLOOR_PRESETS.has(o.floorPreset as MaterialPresetId)
          ? (o.floorPreset as MaterialPresetId)
          : undefined;
      const trimPreset =
        typeof o.trimPreset === 'string' && FLOOR_PRESETS.has(o.trimPreset as MaterialPresetId)
          ? (o.trimPreset as MaterialPresetId)
          : undefined;
      const showBaseboards = typeof o.showBaseboards === 'boolean' ? o.showBaseboards : undefined;
      if (floorPreset == null && trimPreset == null && showBaseboards == null) return null;
      return { type: 'set_appearance', floorPreset, trimPreset, showBaseboards };
    }
    case 'set_curtains': {
      const color = typeof o.color === 'string' ? normalizeHexColor(o.color) : null;
      if (!color) return null;
      const openingId =
        typeof o.openingId === 'string' && o.openingId.trim() ? o.openingId.trim() : undefined;
      return { type: 'set_curtains', color, openingId };
    }
    case 'apply_color_scheme': {
      const colors = parseHexList(o.colors);
      if (!colors) return null;
      return { type: 'apply_color_scheme', colors };
    }
    case 'set_item_color': {
      const target = parseTarget(o.target);
      const color = typeof o.color === 'string' ? normalizeHexColor(o.color) : null;
      const field = o.field;
      if (!target || !color) return null;
      if (field !== 'tint' && field !== 'mattress' && field !== 'top' && field !== 'drawer' && field !== 'blanket') {
        return null;
      }
      return { type: 'set_item_color', target, field, color };
    }
    case 'set_bedding': {
      const target = parseTarget(o.target);
      if (!target) return null;
      const sheetColor =
        typeof o.sheetColor === 'string' ? normalizeHexColor(o.sheetColor) ?? undefined : undefined;
      const comforterColor =
        typeof o.comforterColor === 'string'
          ? normalizeHexColor(o.comforterColor) ?? undefined
          : undefined;
      if (!sheetColor && !comforterColor) return null;
      return { type: 'set_bedding', target, sheetColor, comforterColor };
    }
    case 'remove_item':
    case 'duplicate_item': {
      const target = parseTarget(o.target);
      if (!target) return null;
      return { type, target };
    }
    case 'move_item': {
      const target = parseTarget(o.target);
      const placement = parsePlacement(o.placement);
      if (!target || !placement) return null;
      return { type: 'move_item', target, placement };
    }
    case 'rotate_item': {
      const target = parseTarget(o.target);
      const rotationY = typeof o.rotationY === 'number' && Number.isFinite(o.rotationY) ? o.rotationY : null;
      if (!target || rotationY == null) return null;
      return { type: 'rotate_item', target, rotationY };
    }
    case 'add_item': {
      const query = typeof o.query === 'string' ? o.query.trim() : '';
      if (!query) return null;
      const placement = parsePlacement(o.placement);
      return { type: 'add_item', query, placement };
    }
    default:
      return null;
  }
}

export function parseReviseActions(raw: unknown): ReviseAction[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviseAction[] = [];
  for (const entry of raw) {
    const action = parseOneAction(entry);
    if (action) out.push(action);
  }
  return out;
}

export function parseReviseAgentResponse(raw: unknown): { reply: string; actions: ReviseAction[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const reply = typeof o.reply === 'string' ? o.reply.trim() : '';
  if (!reply) return null;
  return { reply, actions: parseReviseActions(o.actions) };
}

export const MAX_ADDS_PER_TURN = 8;
export const MAX_REMOVES_WITHOUT_CONFIRM = 3;
