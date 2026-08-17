import { create } from 'zustand';
import { FURNITURE, FurnitureKind, LIGHT_SOURCE_SIZE } from './furniture/registry';
import { findValidElevation, settleGravity, validatePlacement } from './interaction/collision';
import { trackAddToDesign } from './lib/analytics';
import { resolveImportedInitialSize } from './lib/importedItemSize';
import { DEFAULT_RUG_COLOR, isChecklistRug } from './lib/checklistPublicGlbs';
import {
  clampPlan,
  clampPlanHeight,
  DEFAULT_ROOM_GEOMETRY,
  normalizeRoomGeometry,
  planBounds,
  planCentroid,
  type RoomGeometry,
} from './lib/roomGeometry';
import { clampPositionInRoom } from './interaction/collision';
import type { Weather } from './lib/environment';
import {
  DEFAULT_APPEARANCE,
  type RoomAppearance,
} from './lib/roomAppearance';
import {
  DEFAULT_VISUAL_SETTINGS,
  loadVisualSettings,
  saveVisualSettings,
  type CameraPresetId,
  type CutawayMode,
  type RenderQualityTier,
  type VisualSettings,
} from './lib/renderQuality';
import type {
  HangingAnchor,
  HangingDecorKind,
  HangingDecorationConfig,
} from './lib/hangingDecorGeometry';
import {
  createHangingSeed,
  DEFAULT_LEAF_CONFIG,
  DEFAULT_LIGHT_CONFIG,
  hangingReferencesAttachmentKey,
} from './lib/hangingDecorGeometry';
import {
  comforterHexFromConfig,
  isAnyBeddingLayerEnabled,
  mergeBeddingConfig,
  resolveBeddingConfig,
} from './lib/bedding/config';
import type { BeddingConfig, BeddingConfigPatch } from './lib/bedding/types';

export type {
  HangingAnchor,
  HangingDecorKind,
  HangingDecorationConfig,
} from './lib/hangingDecorGeometry';

export type DesignerTool = 'select' | 'hanging-leaves' | 'hanging-lights' | 'place-light';

export interface HangingDraft {
  kind: HangingDecorKind;
  anchors: HangingAnchor[];
  /** Live cursor preview point in world space (not yet committed). */
  cursorWorld: [number, number, number] | null;
}

const BED_MIN_BODY_H = 4;
export const DEFAULT_BLANKET_COLOR = '#6b8cae';

export type { RoomAppearance, VisualSettings, CameraPresetId, CutawayMode, RenderQualityTier };
/**
 * Legacy beds used frame-bottom coordinates: position.y === leg height on the floor,
 * and size[1] was only the frame+mattress stack (legs not included). New format:
 * position.y is the floor (bottom of legs), size[1] === legHeight + bodyHeight.
 */
export function normalizeBedItem(it: Item): Item {
  if (it.kind !== 'bed') return it;
  const leg = it.bedLegHeight ?? 8;
  if (it.size[1] > leg + 8) return it;
  if (it.position[1] < leg - 1) return it;
  return {
    ...it,
    size: [it.size[0], it.size[1] + leg, it.size[2]],
    position: [it.position[0], it.position[1] - leg, it.position[2]],
  };
}

export interface RoomEnvironment {
  timeOfDay: number;       // 0..24
  orientationDeg: number;  // 0..360, room yaw vs sun
  exposure: number;        // global brightness trim, default 1
  skyMode: 'gradient' | 'studio';
  weather: Weather;
  godRays: boolean;
  /** Invisible ceiling plane that casts shadows (toggle). */
  shadowRoof: boolean;
  /** Persisted room finishes (walls/floor/ceiling/trim). */
  appearance: RoomAppearance;
}

export const DEFAULT_ENVIRONMENT: RoomEnvironment = {
  timeOfDay: 13,
  orientationDeg: 0,
  exposure: 1,
  skyMode: 'gradient',
  weather: 'partlyCloudy',
  godRays: false,
  shadowRoof: true,
  appearance: { ...DEFAULT_APPEARANCE },
};

export interface EmitterConfig {
  enabled: boolean;
  type: 'point' | 'spot';
  color: string;
  intensity: number;
  range: number;
  angleDeg?: number;
  emissiveBoost?: number;
}

export const DEFAULT_EMITTER: EmitterConfig = {
  enabled: true,
  type: 'point',
  color: '#fff4e0',
  intensity: 2.2,
  range: 120,
  emissiveBoost: 0.55,
};

export interface Item {
  id: string;
  kind: FurnitureKind;
  position: [number, number, number]; // base of item; y is bottom of bounding box
  rotationY: number;
  size: [number, number, number];
  bedLegHeight?: number;
  importedUrl?: string;
  /** Supabase Storage path in `model-files` bucket; persisted on save (not a signed URL). */
  importedStoragePath?: string;
  /** GLTF mesh bounds before user scale; only for `imported` */
  importedNaturalSize?: [number, number, number];
  /** Catalog inch dimensions (community models); used to recover size after mesh load. */
  catalogSizeIn?: [number, number, number];
  label: string;
  /** Gravity off on drag only when checked AND touching a wall; height slider ignores this flag. */
  wallMounted?: boolean;
  /** Builtin bed: show blanket + pillow meshes. */
  beddingEnabled?: boolean;
  /** Hex color for blanket when bedding is enabled. */
  blanketColor?: string;
  /** Hex tint for recolorable imports (checklist rug). */
  tintColor?: string;
  /** Supabase Storage path for blanket pattern image (`model-files` bucket). */
  blanketTexturePath?: string;
  /** Signed URL for blanket texture (runtime only; not persisted). */
  blanketTextureUrl?: string;
  /** Modular bedding layers (topper, sheets, comforter, pillows). */
  beddingConfig?: BeddingConfig;
  emitter?: EmitterConfig;
  /** Verified curated shopping product linked to this placement. */
  curatedProductId?: string;
  /**
   * Stable per-room instance key. Survives save (row id regeneration) and is
   * what hanging furniture-anchors reference.
   */
  attachmentKey: string;
  /** Procedural hanging decoration payload (kind === 'hanging'). */
  hanging?: HangingDecorationConfig;
}

interface StoreState {
  items: Record<string, Item>;
  order: string[];
  /** Primary selection (last clicked); used by inspector / arc menu. */
  selectedId: string | null;
  /** All selected item ids (shift-click multi-select). Includes selectedId when set. */
  selectedIds: string[];
  invalid: boolean;

  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
  /** Client-only render prefs (not persisted to Supabase). */
  visual: VisualSettings;
  /** Transient: hide editor chrome while capturing a frame. */
  captureMode: boolean;
  /** Designer interaction tool (select vs hanging place modes). */
  designerTool: DesignerTool;
  /** In-progress hanging path (not persisted until finished). */
  hangingDraft: HangingDraft | null;

  setTimeOfDay: (h: number) => void;
  setOrientation: (deg: number) => void;
  setExposure: (x: number) => void;
  setSkyMode: (m: 'gradient' | 'studio') => void;
  setWeather: (w: Weather) => void;
  setGodRays: (on: boolean) => void;
  setShadowRoof: (on: boolean) => void;
  setAppearance: (patch: Partial<RoomAppearance>) => void;
  setAppearanceFull: (appearance: RoomAppearance) => void;
  setVisualQuality: (q: RenderQualityTier) => void;
  setRelightImports: (on: boolean) => void;
  setAdvancedControls: (on: boolean) => void;
  setCameraPreset: (p: CameraPresetId) => void;
  setCutaway: (m: CutawayMode) => void;
  setCaptureMode: (on: boolean) => void;
  setRoomGeometry: (geom: RoomGeometry) => void;
  setRoomHeight: (height: number) => void;

  setDesignerTool: (tool: DesignerTool) => void;
  beginHangingDraft: (kind: HangingDecorKind) => void;
  appendHangingAnchor: (anchor: HangingAnchor) => void;
  popHangingAnchor: () => void;
  setHangingCursor: (world: [number, number, number] | null) => void;
  cancelHangingDraft: () => void;
  finishHangingDraft: () => string | null;
  setHangingConfig: (id: string, patch: Partial<HangingDecorationConfig>) => void;
  addHangingDecoration: (config: HangingDecorationConfig) => string;
  /** Spawn a free-floating light at room center and select it. */
  addLightSource: () => string;

  /** Replace layout from persisted data for the active room. */
  hydrateLayout: (payload: Item[], orderIds: string[]) => void;
  hydrateRoomSettings: (environment: RoomEnvironment, roomGeometry: RoomGeometry) => void;
  /** Clear scene (switch room / sign out). */
  resetLayout: () => void;

  addItem: (
    kind: FurnitureKind,
    opts?: {
      url?: string;
      storagePath?: string;
      label?: string;
      size?: [number, number, number];
      catalogSizeIn?: [number, number, number];
      curatedProductId?: string;
      tintColor?: string;
    },
  ) => string;
  /** Clone an item with a new id, slight position offset; appends and selects it. */
  duplicateItem: (id: string) => string | null;
  removeItem: (id: string) => void;
  updatePosition: (id: string, position: [number, number, number]) => void;
  /** Batch-update positions in one store write (group drag). */
  updatePositions: (positions: Record<string, [number, number, number]>) => void;
  updateRotation: (id: string, rotationY: number) => void;
  setItemSize: (id: string, size: [number, number, number]) => void;
  /** Manual height — resolves vertical overlaps only (no gravity / no floor snap). */
  setItemElevation: (id: string, y: number) => void;
  settleItem: (id: string) => void;
  setWallMounted: (id: string, mounted: boolean) => void;
  setBedHeight: (id: string, h: number) => void;
  setBeddingEnabled: (id: string, enabled: boolean) => void;
  setBeddingConfig: (id: string, patch: BeddingConfigPatch) => void;
  setBlanketColor: (id: string, hex: string) => void;
  setTintColor: (id: string, hex: string) => void;
  setBlanketTexture: (
    id: string,
    tex: { path: string; url: string } | null,
  ) => void;
  setEmitterEnabled: (id: string, enabled: boolean) => void;
  setEmitterConfig: (id: string, patch: Partial<EmitterConfig>) => void;
  registerImportedNaturalSize: (id: string, natural: [number, number, number]) => void;
  setImportedSize: (id: string, size: [number, number, number]) => void;
  /**
   * Replace selection, or toggle membership when `additive` (shift-click).
   * Pass null to clear.
   */
  select: (id: string | null, opts?: { additive?: boolean }) => void;
  setInvalid: (v: boolean) => void;
}

/** Keep selectedId in sync as the last id in selectedIds. */
function selectionOf(ids: string[]): { selectedIds: string[]; selectedId: string | null } {
  return {
    selectedIds: ids,
    selectedId: ids.length > 0 ? ids[ids.length - 1]! : null,
  };
}

let nextId = 1;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Wrap an angle into [0, 360). */
const wrapDeg = (deg: number) => ((deg % 360) + 360) % 360;

export function newAttachmentKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ensureAttachmentKey(item: Item): Item {
  if (item.attachmentKey) return item;
  return { ...item, attachmentKey: newAttachmentKey() };
}

export function clampFullItemPosition(
  position: [number, number, number],
  rotationY: number,
  size: [number, number, number],
  room = useStore.getState().roomGeometry,
): [number, number, number] {
  const [x, y, z] = clampPositionInRoom(position, rotationY, size, room);
  return [x, clamp(y, 0, Math.max(0, room.height - size[1])), z];
}

function bumpNextIdFromExistingIds(ids: string[]) {
  for (const id of ids) {
    const m = /^item-(\d+)$/i.exec(id);
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1);
  }
}

function hangingLabel(kind: HangingDecorKind): string {
  return kind === 'lights' ? 'String lights' : 'Hanging leaves';
}

function cascadeRemoveHangingForAttachment(
  items: Record<string, Item>,
  order: string[],
  attachmentKey: string,
  selectedIds: string[],
): { items: Record<string, Item>; order: string[]; selectedIds: string[]; selectedId: string | null } {
  const nextItems = { ...items };
  const removeIds: string[] = [];
  for (const id of order) {
    const it = nextItems[id];
    if (!it || it.kind !== 'hanging' || !it.hanging) continue;
    if (hangingReferencesAttachmentKey(it.hanging, attachmentKey)) {
      removeIds.push(id);
      delete nextItems[id];
    }
  }
  if (removeIds.length === 0) {
    return { items, order, ...selectionOf(selectedIds) };
  }
  const removeSet = new Set(removeIds);
  return {
    items: nextItems,
    order: order.filter((id) => !removeSet.has(id)),
    ...selectionOf(selectedIds.filter((id) => !removeSet.has(id))),
  };
}

export const useStore = create<StoreState>((set, get) => ({
  items: {},
  order: [],
  selectedId: null,
  selectedIds: [],
  invalid: false,

  environment: { ...DEFAULT_ENVIRONMENT, appearance: { ...DEFAULT_APPEARANCE } },
  roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY),
  visual: loadVisualSettings(),
  captureMode: false,
  designerTool: 'select',
  hangingDraft: null,

  setTimeOfDay: (h) =>
    set((s) => ({ environment: { ...s.environment, timeOfDay: clamp(h, 0, 24) } })),
  setOrientation: (deg) =>
    set((s) => ({ environment: { ...s.environment, orientationDeg: wrapDeg(deg) } })),
  setExposure: (x) =>
    set((s) => ({ environment: { ...s.environment, exposure: clamp(x, 0.2, 3) } })),
  setSkyMode: (m) =>
    set((s) => ({ environment: { ...s.environment, skyMode: m } })),
  setWeather: (w) =>
    set((s) => ({ environment: { ...s.environment, weather: w } })),
  setGodRays: (on) =>
    set((s) => ({ environment: { ...s.environment, godRays: on } })),
  setShadowRoof: (on) =>
    set((s) => ({ environment: { ...s.environment, shadowRoof: on } })),
  setAppearance: (patch) =>
    set((s) => ({
      environment: {
        ...s.environment,
        appearance: { ...s.environment.appearance, ...patch },
      },
    })),
  setAppearanceFull: (appearance) =>
    set((s) => ({
      environment: { ...s.environment, appearance: { ...appearance } },
    })),
  setVisualQuality: (q) =>
    set((s) => {
      const visual = { ...s.visual, quality: q };
      saveVisualSettings(visual);
      return { visual };
    }),
  setRelightImports: (on) =>
    set((s) => {
      const visual = { ...s.visual, relightImports: on };
      saveVisualSettings(visual);
      return { visual };
    }),
  setAdvancedControls: (on) =>
    set((s) => {
      const visual = { ...s.visual, advancedControls: on };
      saveVisualSettings(visual);
      return { visual };
    }),
  setCameraPreset: (p) =>
    set((s) => {
      const visual = { ...s.visual, cameraPreset: p };
      saveVisualSettings(visual);
      return { visual };
    }),
  setCutaway: (m) =>
    set((s) => {
      const visual = { ...s.visual, cutaway: m };
      saveVisualSettings(visual);
      return { visual };
    }),
  setCaptureMode: (on) => set({ captureMode: on }),

  setRoomGeometry: (geom) => set({ roomGeometry: normalizeRoomGeometry(geom) }),

  setRoomHeight: (height) =>
    set((s) => ({
      roomGeometry: clampPlan({ ...s.roomGeometry, height: clampPlanHeight(height) }),
    })),

  setDesignerTool: (tool) =>
    set(() => {
      if (tool === 'select') {
        return { designerTool: tool, hangingDraft: null };
      }
      if (tool === 'place-light') {
        // Spawn is handled by addLightSource; keep tool as select.
        return { designerTool: 'select', hangingDraft: null };
      }
      const kind: HangingDecorKind = tool === 'hanging-lights' ? 'lights' : 'leaves';
      return {
        designerTool: tool,
        ...selectionOf([]),
        hangingDraft: { kind, anchors: [], cursorWorld: null },
      };
    }),

  beginHangingDraft: (kind) =>
    set({
      designerTool: kind === 'lights' ? 'hanging-lights' : 'hanging-leaves',
      ...selectionOf([]),
      hangingDraft: { kind, anchors: [], cursorWorld: null },
    }),

  appendHangingAnchor: (anchor) =>
    set((s) => {
      if (!s.hangingDraft) return s;
      return {
        hangingDraft: {
          ...s.hangingDraft,
          anchors: [...s.hangingDraft.anchors, anchor],
        },
      };
    }),

  popHangingAnchor: () =>
    set((s) => {
      if (!s.hangingDraft || s.hangingDraft.anchors.length === 0) return s;
      return {
        hangingDraft: {
          ...s.hangingDraft,
          anchors: s.hangingDraft.anchors.slice(0, -1),
        },
      };
    }),

  setHangingCursor: (world) =>
    set((s) => {
      if (!s.hangingDraft) return s;
      return { hangingDraft: { ...s.hangingDraft, cursorWorld: world } };
    }),

  cancelHangingDraft: () => set({ hangingDraft: null, designerTool: 'select' }),

  finishHangingDraft: () => {
    const draft = get().hangingDraft;
    if (!draft || draft.anchors.length < 2) return null;
    const base = draft.kind === 'lights' ? DEFAULT_LIGHT_CONFIG : DEFAULT_LEAF_CONFIG;
    const config: HangingDecorationConfig = {
      ...base,
      anchors: draft.anchors,
      seed: createHangingSeed(),
      palette: draft.kind === 'lights' ? [...base.palette] : [],
    };
    const id = get().addHangingDecoration(config);
    set({ hangingDraft: null, designerTool: 'select' });
    return id;
  },

  setHangingConfig: (id, patch) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'hanging' || !it.hanging) return s;
      return {
        items: {
          ...s.items,
          [id]: { ...it, hanging: { ...it.hanging, ...patch } },
        },
      };
    }),

  addHangingDecoration: (config) => {
    const id = `item-${nextId++}`;
    const item: Item = {
      id,
      kind: 'hanging',
      position: [0, 0, 0],
      rotationY: 0,
      size: [12, 12, 12],
      label: hangingLabel(config.kind),
      attachmentKey: newAttachmentKey(),
      hanging: {
        ...config,
        anchors: [...config.anchors],
        palette: [...config.palette],
      },
    };
    set((s) => ({
      items: { ...s.items, [id]: item },
      order: [...s.order, id],
      ...selectionOf([id]),
      designerTool: 'select',
      hangingDraft: null,
    }));
    return id;
  },

  addLightSource: () => {
    const id = `item-${nextId++}`;
    const room = get().roomGeometry;
    const size = [...LIGHT_SOURCE_SIZE] as [number, number, number];
    const [cx, cz] = planCentroid(room);
    const centerY = clamp(Math.round(Math.min(60, Math.max(28, room.height * 0.45))), size[1], room.height);
    const y = clamp(centerY - size[1] / 2, 0, Math.max(0, room.height - size[1]));
    const position = clampFullItemPosition([cx, y, cz], 0, size, room);
    const item: Item = {
      id,
      kind: 'light',
      position,
      rotationY: 0,
      size,
      label: 'Light',
      attachmentKey: newAttachmentKey(),
      emitter: { ...DEFAULT_EMITTER, enabled: true },
    };
    set((s) => ({
      items: { ...s.items, [id]: item },
      order: [...s.order, id],
      ...selectionOf([id]),
      designerTool: 'select',
      hangingDraft: null,
    }));
    trackAddToDesign({ kind: 'hanging' });
    return id;
  },

  hydrateLayout: (payload, orderIds) =>
    set(() => {
      bumpNextIdFromExistingIds(orderIds);
      const items: Record<string, Item> = {};
      for (const it of payload) {
        const normalized = ensureAttachmentKey(normalizeBedItem(it));
        items[normalized.id] = normalized;
      }
      return {
        items,
        order: [...orderIds],
        ...selectionOf([]),
        invalid: false,
        designerTool: 'select' as DesignerTool,
        hangingDraft: null,
      };
    }),

  hydrateRoomSettings: (environment, roomGeometry) =>
    set(() => ({
      environment: {
        ...environment,
        appearance: { ...(environment.appearance ?? DEFAULT_APPEARANCE) },
      },
      roomGeometry: normalizeRoomGeometry(roomGeometry),
    })),

  resetLayout: () =>
    set(() => {
      nextId = 1;
      return {
        items: {},
        order: [],
        ...selectionOf([]),
        invalid: false,
        environment: { ...DEFAULT_ENVIRONMENT, appearance: { ...DEFAULT_APPEARANCE } },
        roomGeometry: structuredClone(DEFAULT_ROOM_GEOMETRY),
        designerTool: 'select' as DesignerTool,
        hangingDraft: null,
      };
    }),

  addItem: (kind, opts) => {
    if (kind === 'hanging') {
      throw new Error('Use addHangingDecoration for hanging items');
    }
    if (kind === 'light') {
      return get().addLightSource();
    }
    const id = `item-${nextId++}`;
    const def = kind === 'imported' ? null : FURNITURE[kind];
    const size: [number, number, number] = opts?.size ?? (def ? def.size : [24, 24, 24]);
    const isBed = kind === 'bed';
    const bedLegHeight = isBed ? 8 : undefined;
    const bodyH = isBed && def ? def.size[1] : 0;
    const room = useStore.getState().roomGeometry;
    const [cx, cz] = planCentroid(room);
    const position: [number, number, number] = [cx, 0, cz];
    const itemSize: [number, number, number] = isBed && def
      ? [def.size[0], bedLegHeight! + bodyH, def.size[2]]
      : size;
    const catalogSizeIn =
      kind === 'imported'
        ? (opts?.catalogSizeIn ?? ([...itemSize] as [number, number, number]))
        : undefined;

    const item: Item = {
      id,
      kind,
      position,
      rotationY: 0,
      size: itemSize,
      bedLegHeight,
      importedUrl: opts?.url,
      importedStoragePath: opts?.storagePath,
      catalogSizeIn,
      label: opts?.label ?? (def ? def.label : 'Model'),
      curatedProductId: opts?.curatedProductId,
      tintColor:
        opts?.tintColor ??
        (kind === 'imported' &&
        isChecklistRug({ importedStoragePath: opts?.storagePath, label: opts?.label })
          ? DEFAULT_RUG_COLOR
          : undefined),
      attachmentKey: newAttachmentKey(),
    };
    set((s) => ({
      items: { ...s.items, [id]: item },
      order: [...s.order, id],
      ...selectionOf([id]),
    }));
    trackAddToDesign({
      kind,
      ...(opts?.curatedProductId ? { curated_product_id: opts.curatedProductId } : {}),
    });
    return id;
  },

  duplicateItem: (id) => {
    const src = useStore.getState().items[id];
    if (!src) return null;
    const newId = `item-${nextId++}`;
    const offset = src.kind === 'hanging' ? 0 : 12;
    const rawPosition: [number, number, number] = [
      src.position[0] + offset,
      src.position[1],
      src.position[2] + offset,
    ];
    const position =
      src.kind === 'hanging'
        ? ([...src.position] as [number, number, number])
        : clampFullItemPosition(rawPosition, src.rotationY, src.size);
    const clone: Item = {
      ...src,
      id: newId,
      position,
      size: [...src.size] as [number, number, number],
      attachmentKey: newAttachmentKey(),
      hanging: src.hanging
        ? {
            ...src.hanging,
            anchors: [...src.hanging.anchors],
            palette: [...src.hanging.palette],
            seed: (src.hanging.seed + 1) >>> 0,
          }
        : undefined,
    };
    set((s) => ({
      items: { ...s.items, [newId]: clone },
      order: [...s.order, newId],
      ...selectionOf([newId]),
    }));
    return newId;
  },

  removeItem: (id) =>
    set((s) => {
      const removed = s.items[id];
      if (!removed) return s;
      const { [id]: _, ...rest } = s.items;
      let items = rest;
      let order = s.order.filter((x) => x !== id);
      let selectedIds = s.selectedIds.filter((x) => x !== id);
      if (removed.kind !== 'hanging' && removed.attachmentKey) {
        const cascaded = cascadeRemoveHangingForAttachment(
          items,
          order,
          removed.attachmentKey,
          selectedIds,
        );
        items = cascaded.items;
        order = cascaded.order;
        selectedIds = cascaded.selectedIds;
      }
      return { items, order, ...selectionOf(selectedIds) };
    }),

  updatePosition: (id, position) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      return { items: { ...s.items, [id]: { ...it, position } } };
    }),

  updatePositions: (positions) =>
    set((s) => {
      let items = s.items;
      let changed = false;
      for (const id of Object.keys(positions)) {
        const it = items[id];
        const position = positions[id];
        if (!it || !position) continue;
        if (!changed) {
          items = { ...items };
          changed = true;
        }
        items[id] = { ...it, position };
      }
      return changed ? { items } : s;
    }),

  updateRotation: (id, rotationY) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind === 'hanging') return s;
      let next: Item = { ...it, rotationY };
      next.position = clampFullItemPosition(next.position, rotationY, next.size);
      const others = Object.values(s.items).filter((o) => o.id !== id);
      if (!validatePlacement(next, others).ok) return s;
      return { items: { ...s.items, [id]: next } };
    }),

  setItemSize: (id, sizeInput) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind === 'hanging') return s;
      const room = s.roomGeometry;
      const b = planBounds(room);
      const maxFootprint = Math.max(b.width, b.depth, 200);
      let heightMax = room.height;
      let size: [number, number, number] = [
        clamp(sizeInput[0], 1, maxFootprint),
        clamp(sizeInput[1], 4, heightMax),
        clamp(sizeInput[2], 1, maxFootprint),
      ];
      if (it.kind === 'bed') {
        const leg = it.bedLegHeight ?? 8;
        size[1] = clamp(sizeInput[1], leg + BED_MIN_BODY_H, heightMax);
      }
      const position = clampFullItemPosition(it.position, it.rotationY, size);
      return { items: { ...s.items, [id]: { ...it, size, position } } };
    }),

  setItemElevation: (id, y) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind === 'hanging') return s;
      const maxY = Math.max(0, s.roomGeometry.height - it.size[1]);
      const targetY = clamp(y, 0, maxY);
      if (it.kind === 'light') {
        return {
          items: {
            ...s.items,
            [id]: { ...it, position: [it.position[0], targetY, it.position[2]] },
          },
        };
      }
      const others = Object.values(s.items).filter((o) => o.id !== id);
      const candidate = { ...it, position: [it.position[0], targetY, it.position[2]] as [number, number, number] };
      const resolvedY = findValidElevation(candidate, others, targetY);
      return { items: { ...s.items, [id]: { ...it, position: [it.position[0], resolvedY, it.position[2]] } } };
    }),

  settleItem: (id) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind === 'hanging' || it.kind === 'light') return s;
      const others = Object.values(s.items).filter((o) => o.id !== id);
      const y = settleGravity(it, others, it.position[1]);
      return { items: { ...s.items, [id]: { ...it, position: [it.position[0], y, it.position[2]] } } };
    }),

  setWallMounted: (id, mounted) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind === 'hanging' || it.kind === 'light') return s;
      const others = Object.values(s.items).filter((o) => o.id !== id);

      let next: Item = { ...it, wallMounted: mounted };
      if (!mounted) {
        const y = settleGravity(next, others, next.position[1]);
        const settled: [number, number, number] = [next.position[0], y, next.position[2]];
        const candidate = { ...next, position: settled };
        if (validatePlacement(candidate, others).ok) {
          next = candidate;
        } else {
          const atFloor: [number, number, number] = [next.position[0], 0, next.position[2]];
          if (validatePlacement({ ...next, position: atFloor }, others).ok) {
            next = { ...next, position: atFloor };
          } else {
            next = { ...next, position: settled };
          }
        }
      }

      return { items: { ...s.items, [id]: next } };
    }),

  setBedHeight: (id, h) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'bed') return s;
      const prevLeg = it.bedLegHeight ?? 8;
      const bodyH = Math.max(BED_MIN_BODY_H, it.size[1] - prevLeg);
      const clamped = clamp(h, 4, Math.min(36, Math.max(4, s.roomGeometry.height - bodyH)));
      const nextSize: [number, number, number] = [it.size[0], clamped + bodyH, it.size[2]];
      const next: Item = {
        ...it,
        bedLegHeight: clamped,
        size: nextSize,
        position: [it.position[0], it.position[1], it.position[2]],
      };
      next.position = clampFullItemPosition(next.position, next.rotationY, nextSize);
      return { items: { ...s.items, [id]: next } };
    }),

  setBeddingEnabled: (id, enabled) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'bed') return s;
      let next: Item = {
        ...it,
        beddingEnabled: enabled,
      };
      if (enabled) {
        if (!next.blanketColor) {
          next = { ...next, blanketColor: DEFAULT_BLANKET_COLOR };
        }
      } else {
        next = { ...next, blanketTextureUrl: undefined };
      }
      return { items: { ...s.items, [id]: next } };
    }),

  setBeddingConfig: (id, patch) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'bed') return s;
      const base = resolveBeddingConfig(it);
      const beddingConfig = mergeBeddingConfig(base, patch);
      const beddingEnabled = isAnyBeddingLayerEnabled(beddingConfig);
      const blanketColor = comforterHexFromConfig(beddingConfig);
      return {
        items: {
          ...s.items,
          [id]: {
            ...it,
            beddingConfig,
            beddingEnabled: beddingEnabled || undefined,
            blanketColor,
          },
        },
      };
    }),

  setBlanketColor: (id, hex) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'bed') return s;
      return { items: { ...s.items, [id]: { ...it, blanketColor: hex } } };
    }),

  setTintColor: (id, hex) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'imported') return s;
      return { items: { ...s.items, [id]: { ...it, tintColor: hex } } };
    }),

  setBlanketTexture: (id, tex) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'bed') return s;
      if (!tex) {
        return {
          items: {
            ...s.items,
            [id]: {
              ...it,
              blanketTexturePath: undefined,
              blanketTextureUrl: undefined,
            },
          },
        };
      }
      return {
        items: {
          ...s.items,
          [id]: {
            ...it,
            blanketTexturePath: tex.path,
            blanketTextureUrl: tex.url,
          },
        },
      };
    }),

  setEmitterEnabled: (id, enabled) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      const base = it.emitter ?? { ...DEFAULT_EMITTER, enabled: false };
      const emitter = enabled
        ? { ...(it.emitter ?? DEFAULT_EMITTER), enabled: true }
        : { ...base, enabled: false };
      return {
        items: {
          ...s.items,
          [id]: { ...it, emitter },
        },
      };
    }),

  setEmitterConfig: (id, patch) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      const base = it.emitter ?? { ...DEFAULT_EMITTER, enabled: false };
      return {
        items: {
          ...s.items,
          [id]: { ...it, emitter: { ...base, ...patch } },
        },
      };
    }),

  registerImportedNaturalSize: (id, natural) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'imported' || it.importedNaturalSize) return s;
      const size = resolveImportedInitialSize(it.size, natural, it.catalogSizeIn);
      return {
        items: {
          ...s.items,
          [id]: { ...it, importedNaturalSize: natural, size },
        },
      };
    }),

  setImportedSize: (id, sizeInput) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'imported' || !it.importedNaturalSize) return s;
      const room = s.roomGeometry;
      const b = planBounds(room);
      const maxFootprint = Math.max(b.width, b.depth, 200);
      const size: [number, number, number] = [
        clamp(sizeInput[0], 1, maxFootprint),
        clamp(sizeInput[1], 4, room.height),
        clamp(sizeInput[2], 1, maxFootprint),
      ];
      const position = clampFullItemPosition(it.position, it.rotationY, size);
      return { items: { ...s.items, [id]: { ...it, size, position } } };
    }),

  select: (id, opts) =>
    set((s) => {
      if (id === null) return selectionOf([]);
      if (!s.items[id]) return s;
      if (opts?.additive) {
        if (s.selectedIds.includes(id)) {
          return selectionOf(s.selectedIds.filter((x) => x !== id));
        }
        return selectionOf([...s.selectedIds, id]);
      }
      return selectionOf([id]);
    }),
  setInvalid: (v) => set({ invalid: v }),
}));
