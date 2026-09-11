import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { parseBeddingConfig } from './bedding/config';
import {
  parseFloorPlan,
  planBounds,
  serializeFloorPlan,
  formatLength,
  type FloorPlan,
} from './floorPlanGeometry';
import {
  parseHangingConfig,
  type HangingDecorKind,
  type WallAnchor,
} from './hangingDecorGeometry';
import { signModelObjectPath, resolveBrowsableModelUrl } from './modelStorage';
import { patchImportedItemsFromCatalog } from './patchImportedFromCatalog';
import { isMaterialPresetId, type MaterialPresetId } from './roomMaterials';
import {
  ROOM_STARTER_TEMPLATES,
  type RoomStarterTemplate,
  type StarterFloorSeed,
  type StarterHangingSeed,
} from './roomStarterTemplates';
import { supabase } from './supabase';
import type { EmitterConfig, Item, RoomEnvironment } from '../store';
import { newAttachmentKey } from '../store';

export type StarterFloorKind = StarterFloorSeed['kind'];

export interface StarterTemplateOverride {
  label?: string;
  description?: string;
  hidden?: boolean;
  timeOfDay?: number;
  appearance?: {
    wallColor?: string;
    floorPreset?: MaterialPresetId;
    recessedLights?: boolean;
  };
  floorItems?: StarterFloorSeed[];
  hanging?: StarterHangingSeed[];
  /** Frozen floor plan from the designer (keeps wall ids stable). */
  plan?: FloorPlan;
  /** Designer placements except hanging décor (see `hanging`). */
  itemSnapshots?: Item[];
}

export const STARTER_EDIT_WORKSPACE_PREFIX = 'starter-edit-';

export function starterEditWorkspaceId(templateId: string): string {
  return `${STARTER_EDIT_WORKSPACE_PREFIX}${templateId}`;
}

export function isStarterEditWorkspaceId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(STARTER_EDIT_WORKSPACE_PREFIX);
}

export function templateIdFromStarterEditWorkspace(id: string): string | null {
  if (!isStarterEditWorkspaceId(id)) return null;
  const templateId = id.slice(STARTER_EDIT_WORKSPACE_PREFIX.length);
  return templateId || null;
}

const ITEM_KINDS = new Set<string>([
  ...Object.keys(FURNITURE),
  'imported',
  'hanging',
  'light',
]);

function parseVec3(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  return [x, y, z];
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

export function parseItemSnapshot(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !ITEM_KINDS.has(o.kind)) return null;
  const kind = o.kind as FurnitureKind;
  const position = parseVec3(o.position);
  const size = parseVec3(o.size);
  if (!position || !size) return null;
  const rotationY = Number(o.rotationY);
  if (!Number.isFinite(rotationY)) return null;
  if (typeof o.label !== 'string') return null;

  const hanging = kind === 'hanging' ? parseHangingConfig(o.hanging) : undefined;
  if (kind === 'hanging' && !hanging) return null;

  const item: Item = {
    id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `snap-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    label: o.label,
    position,
    rotationY,
    size,
    attachmentKey:
      typeof o.attachmentKey === 'string' && o.attachmentKey.trim()
        ? o.attachmentKey.trim()
        : newAttachmentKey(),
  };

  if (typeof o.bedLegHeight === 'number' && Number.isFinite(o.bedLegHeight)) {
    item.bedLegHeight = o.bedLegHeight;
  }
  if (typeof o.importedStoragePath === 'string' && o.importedStoragePath.trim()) {
    item.importedStoragePath = o.importedStoragePath.trim();
  }
  const natural = parseVec3(o.importedNaturalSize);
  if (natural) item.importedNaturalSize = natural;
  const catalogSize = parseVec3(o.catalogSizeIn);
  if (catalogSize) item.catalogSizeIn = catalogSize;
  if (typeof o.catalogKind === 'string' && o.catalogKind.trim()) {
    item.catalogKind = o.catalogKind.trim();
  }
  if (typeof o.wallMounted === 'boolean') item.wallMounted = o.wallMounted;
  if (typeof o.beddingEnabled === 'boolean') item.beddingEnabled = o.beddingEnabled;
  if (isHexColor(o.blanketColor)) item.blanketColor = o.blanketColor;
  if (isHexColor(o.tintColor)) item.tintColor = o.tintColor;
  if (typeof o.blanketTexturePath === 'string' && o.blanketTexturePath.trim()) {
    item.blanketTexturePath = o.blanketTexturePath.trim();
  }
  if (typeof o.curatedProductId === 'string' && o.curatedProductId.trim()) {
    item.curatedProductId = o.curatedProductId.trim();
  }
  const beddingConfig = kind === 'bed' ? parseBeddingConfig(o.beddingConfig) : undefined;
  if (beddingConfig) item.beddingConfig = beddingConfig;
  const emitter = parseEmitter(o.emitter);
  if (emitter) item.emitter = emitter;
  if (hanging) item.hanging = hanging;
  return item;
}

export function sanitizeItemSnapshot(item: Item): Item {
  const next = structuredClone(item);
  delete next.importedUrl;
  delete next.blanketTextureUrl;
  return next;
}

export function hangingSeedFromItem(item: Item, plan: FloorPlan): StarterHangingSeed | null {
  if (item.kind !== 'hanging' || !item.hanging) return null;
  const wallAnchors = item.hanging.anchors.filter((a): a is WallAnchor => a.surface === 'wall');
  if (wallAnchors.length < 2) return null;
  const wallId = wallAnchors[0]!.wallId;
  if (wallAnchors[1]!.wallId !== wallId) return null;
  const wallIndex = plan.walls.findIndex((w) => w.id === wallId);
  if (wallIndex < 0) return null;
  return {
    kind: item.hanging.kind,
    wallIndex,
    offsetStart: wallAnchors[0]!.offset,
    offsetEnd: wallAnchors[1]!.offset,
    height: wallAnchors[0]!.height,
  };
}

function itemToFloorSeed(item: Item): StarterFloorSeed | null {
  if (!isFloorKind(item.kind)) return null;
  const seed: StarterFloorSeed = {
    kind: item.kind,
    position: [...item.position] as [number, number, number],
    rotationY: item.rotationY,
  };
  if (item.label.trim()) seed.label = item.label.trim();
  if (typeof item.beddingEnabled === 'boolean') seed.beddingEnabled = item.beddingEnabled;
  if (isHexColor(item.blanketColor)) seed.blanketColor = item.blanketColor;
  return seed;
}

function dimensionsLabelFromPlan(plan: FloorPlan): string {
  const b = planBounds(plan);
  return `${formatLength(b.width, 'ft-in')} × ${formatLength(b.depth, 'ft-in')}`;
}

/** Capture the live designer into an admin starter override. */
export function overrideFromDesignerState(input: {
  template: RoomStarterTemplate;
  label: string;
  items: Record<string, Item>;
  order: string[];
  environment: RoomEnvironment;
  plan: FloorPlan;
}): StarterTemplateOverride {
  const ordered = input.order
    .map((id) => input.items[id])
    .filter((it): it is Item => Boolean(it));
  const floorItems = ordered
    .map(itemToFloorSeed)
    .filter((s): s is StarterFloorSeed => s != null);
  const hanging = ordered
    .map((it) => hangingSeedFromItem(it, input.plan))
    .filter((s): s is StarterHangingSeed => s != null);
  const itemSnapshots = ordered
    .filter((it) => it.kind !== 'hanging')
    .map(sanitizeItemSnapshot);
  const appearance = input.environment.appearance;
  return {
    label: input.label.trim() || input.template.label,
    description: input.template.description,
    hidden: Boolean(input.template.hidden),
    timeOfDay: input.environment.timeOfDay,
    appearance: {
      wallColor: appearance.wallColor,
      floorPreset: appearance.floorPreset,
      recessedLights: appearance.recessedLights,
    },
    floorItems,
    hanging,
    plan: serializeFloorPlan(input.plan),
    itemSnapshots,
  };
}

export async function resolveStarterItemAssets(items: Item[]): Promise<void> {
  await Promise.all(
    items.map(async (item) => {
      if (item.kind === 'imported' && item.importedStoragePath && !item.importedUrl) {
        const url = await resolveBrowsableModelUrl(item.importedStoragePath);
        if (url) item.importedUrl = url;
      }
      if (item.kind === 'bed' && item.blanketTexturePath && !item.blanketTextureUrl) {
        const signed = await signModelObjectPath(item.blanketTexturePath);
        if (signed) item.blanketTextureUrl = signed;
      }
    }),
  );
  await patchImportedItemsFromCatalog(items);
}

const FLOOR_KINDS = new Set<string>(Object.keys(FURNITURE));
const HANGING_KINDS = new Set<HangingDecorKind>(['leaves', 'lights', 'led-strip']);

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function isFloorKind(v: unknown): v is StarterFloorKind {
  return typeof v === 'string' && FLOOR_KINDS.has(v) && v !== 'imported' && v !== 'hanging' && v !== 'light';
}

function parsePosition(raw: unknown): [number, number, number] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  return [x, y, z];
}

function parseFloorItem(raw: unknown): StarterFloorSeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isFloorKind(o.kind)) return null;
  const position = parsePosition(o.position);
  if (!position) return null;
  const rotationY = Number(o.rotationY);
  if (!Number.isFinite(rotationY)) return null;
  const seed: StarterFloorSeed = {
    kind: o.kind,
    position,
    rotationY,
  };
  if (typeof o.label === 'string' && o.label.trim()) seed.label = o.label.trim();
  if (typeof o.beddingEnabled === 'boolean') seed.beddingEnabled = o.beddingEnabled;
  if (isHexColor(o.blanketColor)) seed.blanketColor = o.blanketColor;
  return seed;
}

function parseHanging(raw: unknown): StarterHangingSeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !HANGING_KINDS.has(o.kind as HangingDecorKind)) return null;
  const wallIndex = Number(o.wallIndex);
  const offsetStart = Number(o.offsetStart);
  const offsetEnd = Number(o.offsetEnd);
  const height = Number(o.height);
  if (![wallIndex, offsetStart, offsetEnd, height].every(Number.isFinite)) return null;
  return {
    kind: o.kind as HangingDecorKind,
    wallIndex,
    offsetStart,
    offsetEnd,
    height,
  };
}

export function parseStarterOverride(raw: unknown): StarterTemplateOverride {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const next: StarterTemplateOverride = {};
  if (typeof o.label === 'string' && o.label.trim()) next.label = o.label.trim();
  if (typeof o.description === 'string') next.description = o.description;
  if (typeof o.hidden === 'boolean') next.hidden = o.hidden;
  if (typeof o.timeOfDay === 'number' && Number.isFinite(o.timeOfDay)) {
    next.timeOfDay = Math.min(24, Math.max(0, o.timeOfDay));
  }
  if (o.appearance && typeof o.appearance === 'object') {
    const a = o.appearance as Record<string, unknown>;
    const appearance: NonNullable<StarterTemplateOverride['appearance']> = {};
    if (isHexColor(a.wallColor)) appearance.wallColor = a.wallColor;
    if (isMaterialPresetId(a.floorPreset)) appearance.floorPreset = a.floorPreset;
    if (typeof a.recessedLights === 'boolean') appearance.recessedLights = a.recessedLights;
    if (Object.keys(appearance).length) next.appearance = appearance;
  }
  if (Array.isArray(o.floorItems)) {
    next.floorItems = o.floorItems.map(parseFloorItem).filter((s): s is StarterFloorSeed => s != null);
  }
  if (Array.isArray(o.hanging)) {
    next.hanging = o.hanging.map(parseHanging).filter((s): s is StarterHangingSeed => s != null);
  }
  const plan = parseFloorPlan(o.plan);
  if (plan) next.plan = plan;
  if (Array.isArray(o.itemSnapshots)) {
    next.itemSnapshots = o.itemSnapshots
      .map(parseItemSnapshot)
      .filter((it): it is Item => it != null && it.kind !== 'hanging');
  }
  return next;
}

export function applyStarterOverride(
  base: RoomStarterTemplate,
  override: StarterTemplateOverride,
): RoomStarterTemplate {
  const plan = override.plan;
  return {
    ...base,
    label: override.label ?? base.label,
    description: override.description ?? base.description,
    hidden: override.hidden ?? false,
    floorItems: override.floorItems ?? base.floorItems,
    hanging: override.hanging ?? base.hanging,
    itemSnapshots: override.itemSnapshots ?? base.itemSnapshots,
    dimensionsLabel: plan ? dimensionsLabelFromPlan(plan) : base.dimensionsLabel,
    buildPlan: plan ? () => structuredClone(plan) : base.buildPlan,
    buildEnvironment: () => {
      const env = base.buildEnvironment();
      return {
        ...env,
        timeOfDay: override.timeOfDay ?? env.timeOfDay,
        appearance: {
          ...env.appearance,
          ...(override.appearance ?? {}),
        },
      };
    },
  };
}

export function mergeStarterTemplates(
  builtins: readonly RoomStarterTemplate[],
  overrides: Record<string, StarterTemplateOverride>,
): RoomStarterTemplate[] {
  return builtins.map((t) => {
    const o = overrides[t.id];
    return o ? applyStarterOverride(t, o) : { ...t, hidden: false };
  });
}

export function floorItemKindOptions(): { value: StarterFloorKind; label: string }[] {
  return (Object.keys(FURNITURE) as FurnitureKind[])
    .filter((k): k is StarterFloorKind => isFloorKind(k))
    .map((k) => ({ value: k, label: FURNITURE[k].label }));
}

let overrideMap: Record<string, StarterTemplateOverride> = {};
let resolved: RoomStarterTemplate[] = mergeStarterTemplates(ROOM_STARTER_TEMPLATES, {});
const listeners = new Set<(templates: RoomStarterTemplate[]) => void>();

function emit(): void {
  for (const listener of listeners) listener(resolved);
}

export function getResolvedStarterTemplates(): RoomStarterTemplate[] {
  return resolved;
}

export function getLiveStarterTemplate(id: string): RoomStarterTemplate | undefined {
  return getResolvedStarterTemplates().find((t) => t.id === id);
}

export function liveTemplatesForGoal(goal: RoomStarterTemplate['goal']): RoomStarterTemplate[] {
  return getResolvedStarterTemplates().filter((t) => t.goal === goal && !t.hidden);
}

export function subscribeStarterTemplates(
  listener: (templates: RoomStarterTemplate[]) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function loadStarterTemplateOverrides(): Promise<RoomStarterTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('room_starter_overrides')
      .select('template_id, payload');
    if (error) throw error;
    const next: Record<string, StarterTemplateOverride> = {};
    for (const row of data ?? []) {
      const id = String((row as { template_id?: string }).template_id ?? '');
      if (!id) continue;
      next[id] = parseStarterOverride((row as { payload?: unknown }).payload);
    }
    overrideMap = next;
    resolved = mergeStarterTemplates(ROOM_STARTER_TEMPLATES, overrideMap);
    emit();
  } catch (err) {
    console.warn('[starters] could not load admin overrides', err);
  }
  return resolved;
}

export async function saveStarterTemplateOverride(
  templateId: string,
  payload: StarterTemplateOverride,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from('room_starter_overrides').upsert({
    template_id: templateId,
    payload,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  overrideMap = { ...overrideMap, [templateId]: parseStarterOverride(payload) };
  resolved = mergeStarterTemplates(ROOM_STARTER_TEMPLATES, overrideMap);
  emit();
}

export async function resetStarterTemplateOverride(templateId: string): Promise<void> {
  const { error } = await supabase.from('room_starter_overrides').delete().eq('template_id', templateId);
  if (error) throw new Error(error.message);
  const next = { ...overrideMap };
  delete next[templateId];
  overrideMap = next;
  resolved = mergeStarterTemplates(ROOM_STARTER_TEMPLATES, overrideMap);
  emit();
}

export function snapshotOverrideFromTemplate(template: RoomStarterTemplate): StarterTemplateOverride {
  const env = template.buildEnvironment();
  const next: StarterTemplateOverride = {
    label: template.label,
    description: template.description,
    hidden: Boolean(template.hidden),
    timeOfDay: env.timeOfDay,
    appearance: {
      wallColor: env.appearance.wallColor,
      floorPreset: env.appearance.floorPreset,
      recessedLights: env.appearance.recessedLights,
    },
    floorItems: template.floorItems.map((s) => ({ ...s, position: [...s.position] as [number, number, number] })),
    hanging: (template.hanging ?? []).map((h) => ({ ...h })),
  };
  if (template.itemSnapshots?.length) {
    next.itemSnapshots = template.itemSnapshots.map(sanitizeItemSnapshot);
    next.plan = serializeFloorPlan(template.buildPlan());
  } else if (overrideMap[template.id]?.plan) {
    next.plan = serializeFloorPlan(template.buildPlan());
  }
  return next;
}
