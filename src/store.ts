import { create } from 'zustand';
import { FURNITURE, FurnitureKind } from './furniture/registry';
import { findValidElevation, settleGravity, validatePlacement } from './interaction/collision';
import { resolveImportedInitialSize } from './lib/importedItemSize';
import {
  clampRoomGeometry,
  DEFAULT_ROOM_GEOMETRY,
  type RoomGeometry,
  type RoomWindow,
} from './lib/roomGeometry';

const BED_MIN_BODY_H = 4;
export const DEFAULT_BLANKET_COLOR = '#6b8cae';

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
  godRays: boolean;
}

export const DEFAULT_ENVIRONMENT: RoomEnvironment = {
  timeOfDay: 13,
  orientationDeg: 0,
  exposure: 1,
  skyMode: 'gradient',
  godRays: false,
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
  intensity: 1.5,
  range: 80,
  emissiveBoost: 0.4,
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
  /** Supabase Storage path for blanket pattern image (`model-files` bucket). */
  blanketTexturePath?: string;
  /** Signed URL for blanket texture (runtime only; not persisted). */
  blanketTextureUrl?: string;
  emitter?: EmitterConfig;
}

interface StoreState {
  items: Record<string, Item>;
  order: string[];
  selectedId: string | null;
  invalid: boolean;

  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
  setTimeOfDay: (h: number) => void;
  setOrientation: (deg: number) => void;
  setExposure: (x: number) => void;
  setSkyMode: (m: 'gradient' | 'studio') => void;
  setGodRays: (on: boolean) => void;
  setRoomDimensions: (dims: Partial<Pick<RoomGeometry, 'width' | 'depth' | 'height'>>) => void;
  addWindow: (win?: Partial<RoomWindow>) => void;
  updateWindow: (index: number, patch: Partial<RoomWindow>) => void;
  removeWindow: (index: number) => void;

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
    },
  ) => string;
  /** Clone an item with a new id, slight position offset; appends and selects it. */
  duplicateItem: (id: string) => string | null;
  removeItem: (id: string) => void;
  updatePosition: (id: string, position: [number, number, number]) => void;
  updateRotation: (id: string, rotationY: number) => void;
  setItemSize: (id: string, size: [number, number, number]) => void;
  /** Manual height — resolves vertical overlaps only (no gravity / no floor snap). */
  setItemElevation: (id: string, y: number) => void;
  settleItem: (id: string) => void;
  setWallMounted: (id: string, mounted: boolean) => void;
  setBedHeight: (id: string, h: number) => void;
  setBeddingEnabled: (id: string, enabled: boolean) => void;
  setBlanketColor: (id: string, hex: string) => void;
  setBlanketTexture: (
    id: string,
    tex: { path: string; url: string } | null,
  ) => void;
  setEmitterEnabled: (id: string, enabled: boolean) => void;
  setEmitterConfig: (id: string, patch: Partial<EmitterConfig>) => void;
  registerImportedNaturalSize: (id: string, natural: [number, number, number]) => void;
  setImportedSize: (id: string, size: [number, number, number]) => void;
  select: (id: string | null) => void;
  setInvalid: (v: boolean) => void;
}

let nextId = 1;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Wrap an angle into [0, 360). */
const wrapDeg = (deg: number) => ((deg % 360) + 360) % 360;

export function clampFullItemPosition(
  position: [number, number, number],
  rotationY: number,
  size: [number, number, number],
  room = useStore.getState().roomGeometry,
): [number, number, number] {
  const [w, h, d] = size;
  const c = Math.abs(Math.cos(rotationY));
  const s = Math.abs(Math.sin(rotationY));
  const halfW = (w * c + d * s) / 2;
  const halfD = (w * s + d * c) / 2;
  const inset = 1;
  return [
    clamp(position[0], inset + halfW, room.width - inset - halfW),
    clamp(position[1], 0, Math.max(0, room.height - h)),
    clamp(position[2], inset + halfD, room.depth - inset - halfD),
  ];
}

function bumpNextIdFromExistingIds(ids: string[]) {
  for (const id of ids) {
    const m = /^item-(\d+)$/i.exec(id);
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1);
  }
}

export const useStore = create<StoreState>((set) => ({
  items: {},
  order: [],
  selectedId: null,
  invalid: false,

  environment: { ...DEFAULT_ENVIRONMENT },
  roomGeometry: { ...DEFAULT_ROOM_GEOMETRY, windows: [...DEFAULT_ROOM_GEOMETRY.windows] },

  setTimeOfDay: (h) =>
    set((s) => ({ environment: { ...s.environment, timeOfDay: clamp(h, 0, 24) } })),
  setOrientation: (deg) =>
    set((s) => ({ environment: { ...s.environment, orientationDeg: wrapDeg(deg) } })),
  setExposure: (x) =>
    set((s) => ({ environment: { ...s.environment, exposure: clamp(x, 0.2, 3) } })),
  setSkyMode: (m) =>
    set((s) => ({ environment: { ...s.environment, skyMode: m } })),
  setGodRays: (on) =>
    set((s) => ({ environment: { ...s.environment, godRays: on } })),

  setRoomDimensions: (dims) =>
    set((s) => {
      const next = clampRoomGeometry({
        ...s.roomGeometry,
        ...dims,
      });
      return { roomGeometry: next };
    }),

  addWindow: (win) =>
    set((s) => {
      const geom = s.roomGeometry;
      const patch: RoomWindow = {
        wall: win?.wall ?? 'east',
        x: win?.x ?? 0,
        y: win?.y ?? 36,
        w: win?.w ?? 36,
        h: win?.h ?? 36,
      };
      return {
        roomGeometry: clampRoomGeometry({
          ...geom,
          windows: [...geom.windows, patch],
        }),
      };
    }),

  updateWindow: (index, patch) =>
    set((s) => {
      const windows = s.roomGeometry.windows.map((w, i) =>
        i === index ? { ...w, ...patch } : w,
      );
      return {
        roomGeometry: clampRoomGeometry({ ...s.roomGeometry, windows }),
      };
    }),

  removeWindow: (index) =>
    set((s) => ({
      roomGeometry: clampRoomGeometry({
        ...s.roomGeometry,
        windows: s.roomGeometry.windows.filter((_, i) => i !== index),
      }),
    })),

  hydrateLayout: (payload, orderIds) =>
    set(() => {
      bumpNextIdFromExistingIds(orderIds);
      const items: Record<string, Item> = {};
      for (const it of payload) {
        const normalized = normalizeBedItem(it);
        items[normalized.id] = normalized;
      }
      return {
        items,
        order: [...orderIds],
        selectedId: null,
        invalid: false,
      };
    }),

  hydrateRoomSettings: (environment, roomGeometry) =>
    set(() => ({
      environment: { ...environment },
      roomGeometry: {
        ...roomGeometry,
        windows: [...roomGeometry.windows],
      },
    })),

  resetLayout: () =>
    set(() => {
      nextId = 1;
      return {
        items: {},
        order: [],
        selectedId: null,
        invalid: false,
        environment: { ...DEFAULT_ENVIRONMENT },
        roomGeometry: {
          ...DEFAULT_ROOM_GEOMETRY,
          windows: [...DEFAULT_ROOM_GEOMETRY.windows],
        },
      };
    }),

  addItem: (kind, opts) => {
    const id = `item-${nextId++}`;
    const def = kind === 'imported' ? null : FURNITURE[kind];
    const size: [number, number, number] = opts?.size ?? (def ? def.size : [24, 24, 24]);
    const isBed = kind === 'bed';
    const bedLegHeight = isBed ? 8 : undefined;
    const bodyH = isBed && def ? def.size[1] : 0;
    const room = useStore.getState().roomGeometry;
    const position: [number, number, number] = [room.width / 2, 0, room.depth / 2];
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
    };
    set((s) => ({
      items: { ...s.items, [id]: item },
      order: [...s.order, id],
      selectedId: id,
    }));
    return id;
  },

  duplicateItem: (id) => {
    const src = useStore.getState().items[id];
    if (!src) return null;
    const newId = `item-${nextId++}`;
    const offset = 12;
    const rawPosition: [number, number, number] = [
      src.position[0] + offset,
      src.position[1],
      src.position[2] + offset,
    ];
    const position = clampFullItemPosition(rawPosition, src.rotationY, src.size);
    const clone: Item = {
      ...src,
      id: newId,
      position,
      size: [...src.size] as [number, number, number],
    };
    set((s) => ({
      items: { ...s.items, [newId]: clone },
      order: [...s.order, newId],
      selectedId: newId,
    }));
    return newId;
  },

  removeItem: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.items;
      return {
        items: rest,
        order: s.order.filter((x) => x !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      };
    }),

  updatePosition: (id, position) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      return { items: { ...s.items, [id]: { ...it, position } } };
    }),

  updateRotation: (id, rotationY) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      let next: Item = { ...it, rotationY };
      next.position = clampFullItemPosition(next.position, rotationY, next.size);
      const others = Object.values(s.items).filter((o) => o.id !== id);
      if (!validatePlacement(next, others).ok) return s;
      return { items: { ...s.items, [id]: next } };
    }),

  setItemSize: (id, sizeInput) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      const room = s.roomGeometry;
      const maxFootprint = Math.max(room.width, room.depth, 200);
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
      if (!it) return s;
      const others = Object.values(s.items).filter((o) => o.id !== id);
      const maxY = Math.max(0, s.roomGeometry.height - it.size[1]);
      const targetY = clamp(y, 0, maxY);
      const candidate = { ...it, position: [it.position[0], targetY, it.position[2]] as [number, number, number] };
      const resolvedY = findValidElevation(candidate, others, targetY);
      return { items: { ...s.items, [id]: { ...it, position: [it.position[0], resolvedY, it.position[2]] } } };
    }),

  settleItem: (id) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
      const others = Object.values(s.items).filter((o) => o.id !== id);
      const y = settleGravity(it, others, it.position[1]);
      return { items: { ...s.items, [id]: { ...it, position: [it.position[0], y, it.position[2]] } } };
    }),

  setWallMounted: (id, mounted) =>
    set((s) => {
      const it = s.items[id];
      if (!it) return s;
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

  setBlanketColor: (id, hex) =>
    set((s) => {
      const it = s.items[id];
      if (!it || it.kind !== 'bed') return s;
      return { items: { ...s.items, [id]: { ...it, blanketColor: hex } } };
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
      const maxFootprint = Math.max(room.width, room.depth, 200);
      const size: [number, number, number] = [
        clamp(sizeInput[0], 1, maxFootprint),
        clamp(sizeInput[1], 4, room.height),
        clamp(sizeInput[2], 1, maxFootprint),
      ];
      const position = clampFullItemPosition(it.position, it.rotationY, size);
      return { items: { ...s.items, [id]: { ...it, size, position } } };
    }),

  select: (id) => set({ selectedId: id }),
  setInvalid: (v) => set({ invalid: v }),
}));
