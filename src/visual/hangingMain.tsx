import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Scene } from '../scene/Scene';
import { useStore, newAttachmentKey } from '../store';
import { CATALOG_APPEARANCE } from '../lib/roomAppearance';
import { DEFAULT_ROOM_GEOMETRY } from '../lib/roomGeometry';
import type { HangingDecorationConfig } from '../lib/hangingDecorGeometry';
import '../app.css';

declare global {
  interface Window {
    __TOOVA_HANGING__?: {
      getState: () => ReturnType<typeof useStore.getState>;
      addLights: () => string;
      addLeaves: () => string;
      finishDraft: () => string | null;
      cancelDraft: () => void;
      setPalette: (id: string, colors: string[]) => void;
      remove: (id: string) => void;
    };
  }
}

let seeded = false;

function seedRoom() {
  if (seeded) return;
  seeded = true;
  const store = useStore.getState();
  store.resetLayout();
  store.hydrateRoomSettings(
    {
      timeOfDay: 20,
      orientationDeg: 25,
      exposure: 1.05,
      skyMode: 'gradient',
      weather: 'clear',
      godRays: false,
      shadowRoof: true,
      appearance: { ...CATALOG_APPEARANCE },
    },
    structuredClone(DEFAULT_ROOM_GEOMETRY),
  );
  store.setVisualQuality('high');
  store.setCutaway('openFront');
  store.setCameraPreset('catalog');

  // Place a dresser so furniture-follow anchors can attach.
  const dresserId = store.addItem('dresser');
  const dresser = useStore.getState().items[dresserId]!;
  store.updatePosition(dresserId, [50, 0, 40]);

  const plan = useStore.getState().roomGeometry;
  const wallId = plan.walls[0]!.id;

  const lights: HangingDecorationConfig = {
    version: 1,
    kind: 'lights',
    anchors: [
      { surface: 'wall', wallId, offset: 20, height: 78 },
      { surface: 'wall', wallId, offset: 70, height: 78 },
      {
        surface: 'furniture',
        attachmentKey: dresser.attachmentKey,
        local: [0, 1, 0],
      },
    ],
    sag: 0.16,
    density: 6,
    seed: 42,
    palette: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'],
    lightIntensity: 1.4,
    lightRange: 64,
  };
  store.addHangingDecoration(lights);

  const leaves: HangingDecorationConfig = {
    version: 1,
    kind: 'leaves',
    anchors: [
      { surface: 'wall', wallId, offset: 30, height: 86 },
      { surface: 'wall', wallId, offset: 90, height: 84 },
    ],
    sag: 0.2,
    density: 1.1,
    seed: 99,
    palette: [],
    lightIntensity: 1,
    lightRange: 48,
  };
  store.addHangingDecoration(leaves);

  // Ensure attachment keys exist for any items missing them.
  for (const it of Object.values(useStore.getState().items)) {
    if (!it.attachmentKey) {
      useStore.setState((s) => ({
        items: {
          ...s.items,
          [it.id]: { ...it, attachmentKey: newAttachmentKey() },
        },
      }));
    }
  }
}

function HangingHarness() {
  useEffect(() => {
    seedRoom();
    window.__TOOVA_HANGING__ = {
      getState: () => useStore.getState(),
      addLights: () => {
        useStore.getState().beginHangingDraft('lights');
        const plan = useStore.getState().roomGeometry;
        const wallId = plan.walls[0]!.id;
        useStore.getState().appendHangingAnchor({
          surface: 'wall',
          wallId,
          offset: 12,
          height: 70,
        });
        useStore.getState().appendHangingAnchor({
          surface: 'wall',
          wallId,
          offset: 55,
          height: 70,
        });
        return useStore.getState().finishHangingDraft() ?? '';
      },
      addLeaves: () => {
        useStore.getState().beginHangingDraft('leaves');
        const plan = useStore.getState().roomGeometry;
        const wallId = plan.walls[2]?.id ?? plan.walls[0]!.id;
        useStore.getState().appendHangingAnchor({
          surface: 'wall',
          wallId,
          offset: 20,
          height: 80,
        });
        useStore.getState().appendHangingAnchor({
          surface: 'wall',
          wallId,
          offset: 60,
          height: 80,
        });
        return useStore.getState().finishHangingDraft() ?? '';
      },
      finishDraft: () => useStore.getState().finishHangingDraft(),
      cancelDraft: () => useStore.getState().cancelHangingDraft(),
      setPalette: (id, colors) =>
        useStore.getState().setHangingConfig(id, { palette: colors }),
      remove: (id) => useStore.getState().removeItem(id),
    };
  }, []);

  return (
    <div data-testid="hanging-room" style={{ width: '100vw', height: '100vh' }}>
      <Scene />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<HangingHarness />);
