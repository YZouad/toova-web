import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import type { HangingDecorKind } from './hangingDecorGeometry';
import { isMaterialPresetId, type MaterialPresetId } from './roomMaterials';
import {
  ROOM_STARTER_TEMPLATES,
  type RoomStarterTemplate,
  type StarterFloorSeed,
  type StarterHangingSeed,
} from './roomStarterTemplates';
import { supabase } from './supabase';

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
  return next;
}

export function applyStarterOverride(
  base: RoomStarterTemplate,
  override: StarterTemplateOverride,
): RoomStarterTemplate {
  return {
    ...base,
    label: override.label ?? base.label,
    description: override.description ?? base.description,
    hidden: override.hidden ?? false,
    floorItems: override.floorItems ?? base.floorItems,
    hanging: override.hanging ?? base.hanging,
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
  return {
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
}
