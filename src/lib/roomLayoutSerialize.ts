/**
 * Serialization between Supabase `room_items` rows and the Zustand `Item` type.
 */

import type { FurnitureKind } from '../furniture/registry';
import { DEFAULT_RUG_COLOR, isChecklistRug } from './checklistPublicGlbs';
import { DEFAULT_BLANKET_COLOR, newAttachmentKey, type EmitterConfig, type Item } from '../store';
import {
  parseHangingConfig,
  type HangingDecorationConfig,
} from './hangingDecorGeometry';

const KNOWN_KINDS: FurnitureKind[] = [
  'bed',
  'dresser',
  'wardrobe',
  'desk',
  'chair',
  'nightstand',
  'lamp',
  'imported',
  'hanging',
];

function isFurnitureKind(k: string): k is FurnitureKind {
  return (KNOWN_KINDS as string[]).includes(k);
}

/** Row shape returned from Supabase (snake_case). */
export interface RoomItemRow {
  id: string;
  room_id: string;
  kind: string;
  label: string;
  pos_x: string | number;
  pos_y: string | number;
  pos_z: string | number;
  rotation_y: string | number;
  size_w: string | number;
  size_h: string | number;
  size_d: string | number;
  bed_leg_height: string | number | null;
  natural_w: string | number | null;
  natural_h: string | number | null;
  natural_d: string | number | null;
  sort_order: number;
  model_url?: string | null;
  bedding_enabled?: boolean | null;
  blanket_color?: string | null;
  blanket_texture_path?: string | null;
  emitter?: EmitterConfig | null;
  curated_product_id?: string | null;
  instance_key?: string | null;
  hanging_config?: HangingDecorationConfig | null;
}

export type RoomItemInsert = {
  room_id: string;
  kind: FurnitureKind;
  label: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  rotation_y: number;
  size_w: number;
  size_h: number;
  size_d: number;
  bed_leg_height: number | null;
  natural_w: number | null;
  natural_h: number | null;
  natural_d: number | null;
  sort_order: number;
  model_url: string | null;
  bedding_enabled?: boolean;
  blanket_color: string | null;
  blanket_texture_path: string | null;
  emitter?: EmitterConfig | null;
  curated_product_id: string | null;
  instance_key: string;
  hanging_config: HangingDecorationConfig | null;
};

function n(v: string | number): number {
  return typeof v === 'number' ? v : Number(v);
}

export function dbRowToItem(row: RoomItemRow): Item | null {
  if (!isFurnitureKind(row.kind)) return null;

  let importedNaturalSize: [number, number, number] | undefined;
  if (
    row.natural_w != null &&
    row.natural_h != null &&
    row.natural_d != null &&
    row.kind === 'imported'
  ) {
    importedNaturalSize = [
      n(row.natural_w),
      n(row.natural_h),
      n(row.natural_d),
    ];
  }

  const bedLeg =
    row.bed_leg_height != null ? n(row.bed_leg_height) : undefined;

  const rawModelUrl = row.model_url != null ? String(row.model_url).trim() : '';

  let importedUrl: string | undefined;
  let importedStoragePath: string | undefined;
  if (row.kind === 'imported' && rawModelUrl) {
    if (
      rawModelUrl.startsWith('http://') ||
      rawModelUrl.startsWith('https://') ||
      rawModelUrl.startsWith('blob:')
    ) {
      importedUrl = rawModelUrl;
    } else {
      importedStoragePath = rawModelUrl;
    }
  }

  const beddingEnabled =
    row.kind === 'bed' && row.bedding_enabled === true ? true : undefined;
  const blanketColor = (() => {
    if (row.kind !== 'bed') return undefined;
    if (row.blanket_color != null && String(row.blanket_color).trim()) {
      return String(row.blanket_color);
    }
    if (row.bedding_enabled === true) return DEFAULT_BLANKET_COLOR;
    return undefined;
  })();
  const tintColor = (() => {
    if (row.kind !== 'imported') return undefined;
    if (row.blanket_color != null && String(row.blanket_color).trim()) {
      return String(row.blanket_color).trim();
    }
    if (isChecklistRug({ importedStoragePath, label: row.label })) {
      return DEFAULT_RUG_COLOR;
    }
    return undefined;
  })();
  const blanketTexturePath =
    row.kind === 'bed' &&
    row.blanket_texture_path != null &&
    String(row.blanket_texture_path).trim()
      ? String(row.blanket_texture_path).trim()
      : undefined;

  const emitter = parseEmitter(row.emitter);
  const curatedProductId =
    row.curated_product_id != null && String(row.curated_product_id).trim()
      ? String(row.curated_product_id).trim()
      : undefined;

  const attachmentKey =
    row.instance_key != null && String(row.instance_key).trim()
      ? String(row.instance_key).trim()
      : newAttachmentKey();

  const hanging =
    row.kind === 'hanging' ? parseHangingConfig(row.hanging_config) : undefined;
  if (row.kind === 'hanging' && !hanging) return null;

  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    position: [n(row.pos_x), n(row.pos_y), n(row.pos_z)],
    rotationY: n(row.rotation_y),
    size: [n(row.size_w), n(row.size_h), n(row.size_d)],
    bedLegHeight:
      row.kind === 'bed' && bedLeg !== undefined ? bedLeg : undefined,
    beddingEnabled,
    blanketColor,
    tintColor,
    blanketTexturePath,
    importedNaturalSize,
    importedUrl,
    importedStoragePath,
    emitter,
    curatedProductId,
    attachmentKey,
    hanging: hanging ?? undefined,
  };
}

function parseEmitter(raw: unknown): EmitterConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (o.enabled !== true) return undefined;
  const type = o.type === 'spot' ? 'spot' : o.type === 'point' ? 'point' : null;
  if (!type) return undefined;
  if (typeof o.color !== 'string' || typeof o.intensity !== 'number') return undefined;
  if (typeof o.range !== 'number') return undefined;
  return {
    enabled: true,
    type,
    color: o.color,
    intensity: o.intensity,
    range: o.range,
    angleDeg: typeof o.angleDeg === 'number' ? o.angleDeg : undefined,
    emissiveBoost: typeof o.emissiveBoost === 'number' ? o.emissiveBoost : undefined,
  };
}

export function serializeLayoutForRoom(
  roomId: string,
  items: Record<string, Item>,
  order: string[],
): RoomItemInsert[] {
  const out: RoomItemInsert[] = [];
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    const it = items[id];
    if (!it) continue;

    const natural = it.importedNaturalSize;

    const row: RoomItemInsert = {
      room_id: roomId,
      kind: it.kind,
      label: it.label,
      pos_x: it.position[0],
      pos_y: it.position[1],
      pos_z: it.position[2],
      rotation_y: it.rotationY,
      size_w: it.size[0],
      size_h: it.size[1],
      size_d: it.size[2],
      bed_leg_height:
        it.kind === 'bed' && it.bedLegHeight !== undefined ? it.bedLegHeight : null,
      natural_w:
        natural?.[0] != null ? natural[0] : null,
      natural_h:
        natural?.[1] != null ? natural[1] : null,
      natural_d:
        natural?.[2] != null ? natural[2] : null,
      sort_order: i,
      model_url:
        it.kind === 'imported'
          ? (it.importedStoragePath ?? null)
          : null,
      bedding_enabled: it.kind === 'bed' ? !!it.beddingEnabled : false,
      blanket_color:
        it.kind === 'bed' && it.blanketColor
          ? it.blanketColor
          : it.kind === 'imported' && it.tintColor
            ? it.tintColor
            : null,
      blanket_texture_path:
        it.kind === 'bed' && it.blanketTexturePath
          ? it.blanketTexturePath
          : null,
      curated_product_id: it.curatedProductId ?? null,
      emitter: it.emitter?.enabled ? it.emitter : null,
      instance_key: it.attachmentKey || newAttachmentKey(),
      hanging_config: it.kind === 'hanging' && it.hanging ? it.hanging : null,
    };
    out.push(row);
  }
  return out;
}
