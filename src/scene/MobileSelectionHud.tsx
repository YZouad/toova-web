import { Html } from '@react-three/drei';
import type { ReactNode } from 'react';
import { useStore } from '../store';

const ROT_STEP = (15 * Math.PI) / 180;

function stopOrbit(e: { stopPropagation: () => void; preventDefault?: () => void }) {
  e.stopPropagation();
  e.preventDefault?.();
}

function HudBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="dgm-sel-hud__round"
      aria-label={title}
      title={title}
      onPointerDown={stopOrbit}
      onPointerUp={stopOrbit}
      onClick={(e) => {
        stopOrbit(e);
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Phone in-scene selection chrome — frosted name pill + rotate handles,
 * anchored above the selected piece (same Html pattern as desktop SelectionHud).
 */
export function MobileSelectionHud({ hidden = false }: { hidden?: boolean }) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const captureMode = useStore((s) => s.captureMode);
  const updateRotation = useStore((s) => s.updateRotation);

  if (hidden || captureMode || !selectedId || !item) return null;

  const isHanging = item.kind === 'hanging';
  const isLight = item.kind === 'light';
  const canYaw = !isHanging && !isLight;

  const maxDim = Math.max(item.size[0], item.size[1], item.size[2], 8);
  const liftAbove = Math.min(14, Math.max(3, maxDim * 0.22 + 2));
  const labelAnchor: [number, number, number] = [
    item.position[0],
    item.position[1] + item.size[1] + liftAbove,
    item.position[2],
  ];

  const nudgeRot = (dir: 1 | -1) => {
    const live = useStore.getState().items[item.id];
    if (!live || live.kind === 'hanging' || live.kind === 'light') return;
    updateRotation(live.id, live.rotationY + dir * ROT_STEP);
  };

  return (
    <Html
      position={labelAnchor}
      center
      zIndexRange={[80, 0]}
      style={{ pointerEvents: 'none' }}
      onPointerDown={stopOrbit}
      onPointerUp={stopOrbit}
    >
      <div
        className="dgm-sel-hud dgm-sel-hud--scene"
        aria-label="Selection controls"
        onPointerDown={stopOrbit}
        onPointerUp={stopOrbit}
      >
        <div className="dgm-sel-hud__label">
          <span
            className="dgm-sel-hud__dot"
            style={{ background: item.tintColor ?? '#C9B391' }}
            aria-hidden
          />
          <span className="dgm-sel-hud__name">{item.label}</span>
        </div>

        {canYaw ? (
          <div className="dgm-sel-hud__handles">
            <HudBtn title="Rotate left 15°" onClick={() => nudgeRot(-1)}>
              <RotateGlyph dir="left" />
            </HudBtn>
            <HudBtn title="Rotate right 15°" onClick={() => nudgeRot(1)}>
              <RotateGlyph dir="right" />
            </HudBtn>
          </div>
        ) : null}
      </div>
    </Html>
  );
}

function RotateGlyph({ dir }: { dir: 'left' | 'right' }) {
  // Base path has the arrow on the right; flip for left so the two face outward.
  const flip = dir === 'left';
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}
