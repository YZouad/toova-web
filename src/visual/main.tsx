import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Scene } from '../scene/Scene';
import { useStore } from '../store';
import { CATALOG_APPEARANCE } from '../lib/roomAppearance';
import { DEFAULT_ROOM_GEOMETRY } from '../lib/roomGeometry';
import '../app.css';

/**
 * Deterministic room scene for Playwright / manual visual checks.
 * Open via /visual.html — no auth required.
 */
function VisualHarness() {
  useEffect(() => {
    useStore.getState().hydrateRoomSettings(
      {
        timeOfDay: 13,
        orientationDeg: 25,
        exposure: 1,
        skyMode: 'studio',
        weather: 'clear',
        godRays: false,
        shadowRoof: true,
        appearance: { ...CATALOG_APPEARANCE },
      },
      structuredClone(DEFAULT_ROOM_GEOMETRY),
    );
    useStore.getState().setVisualQuality('presentation');
    useStore.getState().setCutaway('openFront');
    useStore.getState().setCameraPreset('catalog');
  }, []);

  return (
    <div data-testid="visual-room" style={{ width: '100vw', height: '100vh' }}>
      <Scene />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VisualHarness />
  </React.StrictMode>,
);
