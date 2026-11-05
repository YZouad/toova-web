import {
  apartmentModeFor,
  isApartmentPlan,
  itemRoomKey,
  resolveApartmentRooms,
} from '../lib/apartmentRooms';
import { formatLength } from '../lib/floorPlanGeometry';
import { measureDistances } from '../lib/measureDistance';
import { planBounds } from '../lib/roomGeometry';
import {
  DEFAULT_EMITTER,
  hangingKindFromDesignerTool,
  isHangingDesignerTool,
  isMeasureDesignerTool,
  useStore,
  type Item,
} from '../store';

let embedPresent = false;

export function setEmbedPresent(on: boolean): void {
  embedPresent = on;
}

function pieceKindMeta(kind: string): string {
  switch (kind) {
    case 'hanging':
      return 'hanging';
    case 'light':
      return 'light';
    case 'imported':
      return 'imported';
    case 'bed':
      return 'bed';
    default:
      return kind;
  }
}

function toolSnapshot() {
  const s = useStore.getState();
  const drawing =
    s.hangingDraft != null || isHangingDesignerTool(s.designerTool);
  const drawKind =
    s.hangingDraft?.kind ?? hangingKindFromDesignerTool(s.designerTool);
  const anchorCount = s.hangingDraft?.anchors.length ?? 0;
  const measuring = isMeasureDesignerTool(s.designerTool);
  const last = s.measurements[s.measurements.length - 1];
  const measureLabel =
    last != null
      ? formatLength(measureDistances(last.a, last.b).diagonal3d, 'ft-in')
      : null;
  return {
    present: embedPresent,
    designerTool: s.designerTool,
    drawing,
    drawKind,
    drawAnchorCount: anchorCount,
    canFinishDraw: anchorCount >= 2,
    measuring,
    measurePending: s.measurePending != null,
    measureTapeCount: s.measurements.length,
    measureLabel,
    measureSnap: s.measureSnap,
  };
}

type NativeHandler = { postMessage: (body: unknown) => void };

function handler(): NativeHandler | null {
  const w = window as Window & {
    webkit?: { messageHandlers?: { toova?: NativeHandler } };
  };
  return w.webkit?.messageHandlers?.toova ?? null;
}

export function postToNative(message: { type: string } & Record<string, unknown>): void {
  handler()?.postMessage(message);
}

function canTint(item: Item): boolean {
  return item.kind !== 'light' && item.kind !== 'hanging';
}

/** What the native chrome renders. Positions are left out so drags do not flood the bridge. */
export function designerSnapshot() {
  const s = useStore.getState();
  const selected = s.selectedId ? s.items[s.selectedId] : null;
  const env = s.environment;
  const look = env.appearance;
  const bounds = planBounds(s.roomGeometry);
  return {
    selection: selected
      ? {
          id: selected.id,
          label: selected.label,
          kind: selected.kind,
          size: selected.size,
          rotationDeg: Math.round((((selected.rotationY * 180) / Math.PI) % 360 + 360) % 360),
          elevation: Math.round(selected.position[1]),
          maxElevation: Math.max(0, Math.round(s.roomGeometry.height - selected.size[1])),
          maxSide: Math.max(...selected.size),
          maxFootprint: Math.max(bounds.width, bounds.depth, 200),
          canEditSize: selected.kind !== 'imported' || !!selected.importedNaturalSize,
          wallMounted: !!selected.wallMounted,
          tintColor: selected.tintColor ?? null,
          canTint: canTint(selected),
          isFurniture: selected.kind !== 'light' && selected.kind !== 'hanging',
          emitter:
            selected.kind === 'light'
              ? {
                  intensity: selected.emitter?.intensity ?? DEFAULT_EMITTER.intensity,
                  color: selected.emitter?.color ?? DEFAULT_EMITTER.color,
                }
              : null,
        }
      : null,
    selectedWallId: s.selectedWallId,
    pieces: s.order
      .map((id) => s.items[id])
      .filter((it): it is Item => Boolean(it))
      .map((it) => ({
        id: it.id,
        label: it.label,
        kind: it.kind,
        size: it.size,
        elevation: Math.round(it.position[1]),
        tintColor: it.tintColor ?? null,
        importedStoragePath: it.importedStoragePath ?? null,
        catalogKind: it.catalogKind ?? null,
        kindMeta: pieceKindMeta(it.kind),
      })),
    environment: {
      timeOfDay: env.timeOfDay,
      weather: env.weather,
      skyMode: env.skyMode,
      exposure: env.exposure,
      orientationDeg: env.orientationDeg,
      godRays: env.godRays,
    },
    appearance: {
      wallColor: look.wallColor,
      floorPreset: look.floorPreset,
      showCeiling: look.showCeiling,
      recessedLights: look.recessedLights,
      showBaseboards: look.showBaseboards,
    },
    fixturesLit: s.roomFixturesLit(),
    cameraPreset: s.visual.cameraPreset,
    showDimensions: s.visual.showDimensions,
    apartment: apartmentSnapshot(s),
    ...toolSnapshot(),
  };
}

function apartmentSnapshot(s: ReturnType<typeof useStore.getState>) {
  const plan = s.roomGeometry;
  const mode = apartmentModeFor(plan, s.focusedRoomId);
  const rooms = isApartmentPlan(plan) ? resolveApartmentRooms(plan) : [];
  const counts = new Map<string, number>();
  for (const id of s.order) {
    const item = s.items[id];
    if (!item) continue;
    const key = itemRoomKey(plan, item.position[0], item.position[2]);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    mode,
    focusedRoomId: s.focusedRoomId,
    rooms: rooms.map((room) => ({
      id: room.id,
      label: room.label,
      tag: room.tag,
      tagged: room.tagged,
      itemCount: counts.get(room.id) ?? 0,
      anchor: { x: room.labelAnchor[0], z: room.labelAnchor[1] },
    })),
  };
}

/** Notify native chrome when focus changes from taps inside the web view. */
export function postRoomFocus(roomId: string | null): void {
  postToNative({ type: 'roomFocus', roomId });
}
