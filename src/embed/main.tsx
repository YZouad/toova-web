import { StrictMode, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Scene, type SceneHandle } from '../scene/Scene';
import {
  isHangingDesignerTool,
  isMeasureDesignerTool,
  useStore,
  type CameraPresetId,
  type RoomEnvironment,
} from '../store';
import type { FurnitureKind } from '../furniture/registry';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import type { RoomAppearance } from '../lib/roomAppearance';
import type { Weather } from '../lib/environment';
import { supabase } from '../lib/supabase';
import { loadRoomLayout, saveRoomLayout } from '../hooks/useRoomLayout';
import { useScanJobUpdates } from '../hooks/useScanJobUpdates';
import { captureAndUploadRoomThumbnail } from '../lib/roomThumbnailCapture';
import { isPersistableRoomId } from '../lib/checkoutReturn';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';
import { placeFromCatalog } from '../ui/designer/placeCatalogModel';
import { installNativeAssetProxy } from './assetProxy';
import { applyExportWatermark, clampExportDimensions } from '../lib/exportWatermark';
import { generateBuiltinThumbnail, generateRugThumbnail } from '../lib/generateBuiltinThumbnail';
import type { HangingDecorKind } from '../lib/hangingDecorGeometry';
import { designerSnapshot, postToNative, setEmbedPresent } from './bridge';
import type { CaptureOptions } from '../scene/Scene';
import { installNativeTokenRefresh } from './nativeAuth';
import '../app.css';
import '../ui/designer/designer.css';
import '../ui/designer/mobile/mobile-designer.css';

installNativeAssetProxy();
installNativeTokenRefresh();

type NativeSession = { accessToken: string; refreshToken: string };

type CatalogPayload = {
  kind: string;
  label: string;
  storagePath?: string | null;
  modelUrl?: string | null;
  widthIn: number;
  heightIn: number;
  depthIn: number;
};

type EnvironmentPatch = {
  timeOfDay?: number;
  weather?: Weather;
  skyMode?: RoomEnvironment['skyMode'];
  exposure?: number;
  orientationDeg?: number;
  godRays?: boolean;
};

type AppearancePatch = Pick<
  Partial<RoomAppearance>,
  'wallColor' | 'floorPreset' | 'showCeiling' | 'recessedLights' | 'showBaseboards'
>;

const AUTOSAVE_MS = 1500;

let sceneHandle: SceneHandle | null = null;
let roomId: string | null = null;
let scanSyncRoomId: string | null = null;
let scanSyncRoomListener: ((id: string | null) => void) | null = null;
let userId: string | null = null;
let savedFingerprint: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let thumbnailStale = false;

function layoutFingerprint(): string {
  const { items, order, environment, roomGeometry } = useStore.getState();
  return JSON.stringify([items, order, environment, roomGeometry]);
}

function isDirty(): boolean {
  return savedFingerprint !== null && layoutFingerprint() !== savedFingerprint;
}

async function applySession(session: NativeSession): Promise<void> {
  const { data, error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) throw error;
  userId = data.user?.id ?? null;
}

async function saveNow(): Promise<void> {
  if (saving) {
    await saving;
    if (!isDirty()) return;
  }
  if (!roomId || !isDirty()) return;
  const target = roomId;
  const fingerprint = layoutFingerprint();
  const { items, order, environment, roomGeometry } = useStore.getState();
  postToNative({ type: 'saveState', status: 'saving' });
  saving = (async () => {
    try {
      await saveRoomLayout(target, items, order, environment, roomGeometry);
      savedFingerprint = fingerprint;
      thumbnailStale = true;
      postToNative({ type: 'saveState', status: isDirty() ? 'dirty' : 'saved' });
    } catch (err) {
      postToNative({
        type: 'saveState',
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      saving = null;
    }
  })();
  await saving;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow().catch(() => {});
  }, AUTOSAVE_MS);
}

function selectedItem() {
  const s = useStore.getState();
  return s.selectedId ? s.items[s.selectedId] ?? null : null;
}

const api = {
  async start(payload: NativeSession & { roomId: string }) {
    const id = payload.roomId.toLowerCase();
    if (!isPersistableRoomId(id)) throw new Error('This room cannot be opened.');
    await applySession(payload);
    const layout = await loadRoomLayout(id);
    const store = useStore.getState();
    store.hydrateRoomSettings(layout.environment, layout.roomGeometry);
    store.hydrateLayout(layout.items, layout.order);
    store.select(null);
    roomId = id;
    scanSyncRoomId = id;
    scanSyncRoomListener?.(id);
    savedFingerprint = layoutFingerprint();
    postToNative({ type: 'loaded', pieces: layout.order.length });
    publishState(true);
    return true;
  },

  async setSession(payload: NativeSession) {
    await applySession(payload);
    return true;
  },

  /** Save pending edits and refresh the Spaces thumbnail; native awaits this before leaving. */
  async flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveNow();
    if (thumbnailStale && userId && roomId) {
      thumbnailStale = false;
      try {
        await captureAndUploadRoomThumbnail(userId, roomId);
      } catch {
        thumbnailStale = true;
      }
    }
    return true;
  },

  camera(id: CameraPresetId) {
    useStore.getState().setCameraPreset(id);
    sceneHandle?.goToPreset(id);
  },

  setDimensions(on: boolean) {
    useStore.getState().setShowDimensions(on);
  },

  addBuiltin(kind: FurnitureKind) {
    const id = useStore.getState().addItem(kind);
    return id ?? null;
  },

  async addCatalog(entry: CatalogPayload) {
    const raw = (entry.storagePath || entry.modelUrl || '').trim();
    const absolute = /^https?:\/\//.test(raw);
    const model = {
      kind: entry.kind,
      label: entry.label,
      width_in: entry.widthIn,
      height_in: entry.heightIn,
      depth_in: entry.depthIn,
      storagePath: absolute ? '' : raw,
      signedUrl: absolute ? raw : null,
    } as unknown as GalleryModel;
    return placeFromCatalog(model, userId);
  },

  addLight() {
    return useStore.getState().addLightSource();
  },

  select(id: string | null) {
    useStore.getState().select(id);
  },

  duplicateSelected() {
    const item = selectedItem();
    if (!item) return null;
    const copy = useStore.getState().duplicateItem(item.id);
    if (copy) useStore.getState().select(copy);
    return copy;
  },

  removeSelected() {
    const item = selectedItem();
    if (item) useStore.getState().removeItem(item.id);
  },

  rotateSelected(degrees: number) {
    const item = selectedItem();
    if (!item) return;
    useStore.getState().updateRotation(item.id, item.rotationY + (degrees * Math.PI) / 180);
  },

  setRotation(degrees: number) {
    const item = selectedItem();
    if (item) useStore.getState().updateRotation(item.id, (degrees * Math.PI) / 180);
  },

  setScale(maxSide: number) {
    const item = selectedItem();
    if (item) {
      useStore.getState().setItemSize(item.id, proportionalSizesFromMaxSide(item.size, maxSide));
    }
  },

  setElevation(inches: number) {
    const item = selectedItem();
    if (item) useStore.getState().setItemElevation(item.id, inches);
  },

  setWallMounted(on: boolean) {
    const item = selectedItem();
    if (item) useStore.getState().setWallMounted(item.id, on);
  },

  setEmitter(patch: { intensity?: number; color?: string }) {
    const item = selectedItem();
    if (item) useStore.getState().setEmitterConfig(item.id, { ...patch, enabled: true });
  },

  tintSelected(hex: string) {
    const item = selectedItem();
    if (item) useStore.getState().setTintColor(item.id, hex);
  },

  setEnvironment(patch: EnvironmentPatch) {
    const s = useStore.getState();
    if (patch.timeOfDay !== undefined) s.setTimeOfDay(patch.timeOfDay);
    if (patch.weather !== undefined) s.setWeather(patch.weather);
    if (patch.skyMode !== undefined) s.setSkyMode(patch.skyMode);
    if (patch.exposure !== undefined) s.setExposure(patch.exposure);
    if (patch.orientationDeg !== undefined) s.setOrientation(patch.orientationDeg);
    if (patch.godRays !== undefined) s.setGodRays(patch.godRays);
  },

  setAppearance(patch: AppearancePatch) {
    useStore.getState().setAppearance(patch);
  },

  paintWall(color: string, wallId: string | null) {
    useStore.getState().setWallPaint(color, wallId);
  },

  clearWallSelection() {
    useStore.getState().selectWall(null);
  },

  setFixtures(on: boolean) {
    useStore.getState().toggleRoomFixtures(on);
  },

  removeItem(id: string) {
    useStore.getState().removeItem(id);
  },

  startDraw(kind: HangingDecorKind) {
    useStore.getState().beginHangingDraft(kind);
  },

  startMeasure() {
    useStore.getState().beginMeasure(null, false);
  },

  cancelTool() {
    const s = useStore.getState();
    if (isMeasureDesignerTool(s.designerTool)) s.cancelMeasure();
    else if (s.hangingDraft || isHangingDesignerTool(s.designerTool)) s.cancelHangingDraft();
  },

  finishDraw() {
    return useStore.getState().finishHangingDraft();
  },

  popDrawAnchor() {
    useStore.getState().popHangingAnchor();
  },

  finishMeasure() {
    useStore.getState().finishMeasure();
  },

  clearMeasurements() {
    useStore.getState().clearMeasurements();
  },

  toggleMeasureSnap() {
    useStore.getState().toggleMeasureSnap();
  },

  setPresent(on: boolean) {
    setEmbedPresent(on);
    if (on) {
      useStore.getState().select(null);
      presentUi?.(true);
    } else {
      presentUi?.(false);
    }
    publishState(true);
    return true;
  },

  async captureRender(payload: { maxPx?: number; watermark?: boolean; format?: string }) {
    const scene = sceneHandle;
    if (!scene) throw new Error('Scene not ready');
    const maxPx = payload.maxPx ?? 1920;
    const clamped = clampExportDimensions(1920, 1080, maxPx);
    const format =
      payload.format === 'image/jpeg' ? ('image/jpeg' as const) : ('image/png' as const);
    const opts: CaptureOptions = {
      width: clamped.width,
      height: clamped.height,
      format,
      quality: 0.92,
      cameraPreset: 'catalog',
      presentation: true,
    };
    let blob = await scene.captureFrame(opts);
    if (payload.watermark !== false) {
      blob = await applyExportWatermark(blob);
    }
    return await blobToDataUrl(blob);
  },

  async builtinPreview(kind: string) {
    const blob =
      kind === 'checklist-rug'
        ? await generateRugThumbnail()
        : await generateBuiltinThumbnail(kind as Parameters<typeof generateBuiltinThumbnail>[0]);
    if (!blob) return null;
    return await blobToDataUrl(blob);
  },
};

let presentUi: ((on: boolean) => void) | null = null;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

let lastState = '';
let stateTimer: ReturnType<typeof setTimeout> | null = null;

function publishState(immediate = false): void {
  const send = () => {
    stateTimer = null;
    const state = designerSnapshot();
    const encoded = JSON.stringify(state);
    if (encoded === lastState) return;
    lastState = encoded;
    postToNative({ type: 'state', json: encoded });
  };
  if (immediate) {
    if (stateTimer) clearTimeout(stateTimer);
    send();
    return;
  }
  if (!stateTimer) stateTimer = setTimeout(send, 100);
}

let lastFingerprint = '';
useStore.subscribe(() => {
  publishState();
  if (savedFingerprint === null) return;
  const fingerprint = layoutFingerprint();
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;
  if (fingerprint !== savedFingerprint) {
    postToNative({ type: 'saveState', status: 'dirty' });
    scheduleSave();
  }
});

(window as unknown as { toovaDesigner: typeof api }).toovaDesigner = api;

window.addEventListener('error', (e) => {
  postToNative({ type: 'error', message: e.message });
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  postToNative({ type: 'error', message: reason instanceof Error ? reason.message : String(reason) });
});

function ScanRealtimeSync() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(scanSyncRoomId);
  useEffect(() => {
    scanSyncRoomListener = setActiveRoomId;
    return () => {
      scanSyncRoomListener = null;
    };
  }, []);
  useScanJobUpdates(activeRoomId);
  return null;
}

function EmbeddedDesigner() {
  const ref = useRef<SceneHandle>(null);
  const [present, setPresent] = useState(false);
  useEffect(() => {
    sceneHandle = ref.current;
    presentUi = setPresent;
    postToNative({ type: 'ready' });
    return () => {
      sceneHandle = null;
      presentUi = null;
      setEmbedPresent(false);
    };
  }, []);

  return (
    <div className={`dg-page is-compact is-phone${present ? ' is-present' : ''}`}>
      <ScanRealtimeSync />
      <div className="dg-viewport">
        <div className="dg-canvas">
          <Scene
            ref={ref}
            interactionMode="mobile"
            selectionHud={{
              radialOpen: false,
              onToggleRadial: () => {},
              onOpenInspector: () => postToNative({ type: 'inspect' }),
              hidden: present,
            }}
          />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmbeddedDesigner />
  </StrictMode>,
);
