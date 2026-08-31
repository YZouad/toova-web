import { Html } from '@react-three/drei';
import type { ReactNode } from 'react';
import { useStore, type Item } from '../store';

const ROT_STEP = (15 * Math.PI) / 180;

const KIND_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  desk: '#B5946C',
  hanging: '#8A8478',
  light: '#E8C27A',
  imported: '#7E8A60',
  default: '#CBB28F',
};

export interface SelectionHudProps {
  radialOpen: boolean;
  onToggleRadial: () => void;
  onOpenInspector: () => void;
  /** Present mode / drawing — hide all HUD chrome. */
  hidden?: boolean;
}

function stopOrbit(e: { stopPropagation: () => void; preventDefault?: () => void }) {
  e.stopPropagation();
  e.preventDefault?.();
}

function kindSwatch(kind: string): string {
  return KIND_COLORS[kind] ?? KIND_COLORS.default;
}

function detailLabel(kind: string): string {
  if (kind === 'bed') return 'Bedding & details';
  if (kind === 'hanging') return 'Path & bulbs';
  if (kind === 'light') return 'Light settings';
  return 'Edit details';
}

function HudBtn({
  className,
  title,
  onClick,
  children,
  disabled,
}: {
  className?: string;
  title?: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={title}
      disabled={disabled}
      onPointerDown={stopOrbit}
      onPointerUp={stopOrbit}
      onClick={(e) => {
        stopOrbit(e);
        if (!disabled) onClick();
      }}
    >
      {children}
    </button>
  );
}

/**
 * In-scene selection HUD — frosted label + actions radial + rotate handles.
 * Replaces ArcMenu + ObjectGizmo when the designer shell passes `selectionHud`.
 * Height is controlled from the context bar / action sheet; Alt+↑/↓ via KeyboardShortcuts.
 */
export function SelectionHud({
  radialOpen,
  onToggleRadial,
  onOpenInspector,
  hidden = false,
}: SelectionHudProps) {
  const selectedId = useStore((s) => s.selectedId);
  const selectedIds = useStore((s) => s.selectedIds);
  const item = useStore((s) => (s.selectedId ? s.items[s.selectedId] : null));
  const captureMode = useStore((s) => s.captureMode);
  // Read so the hook stays in the dependency graph; new HUD always shows regardless.
  useStore((s) => s.visual.advancedControls);

  const updateRotation = useStore((s) => s.updateRotation);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);

  if (hidden || captureMode || !selectedId || !item) return null;

  const multiCount = selectedIds.length;
  const displayName = multiCount > 1 ? `${multiCount} selected` : item.label;

  const isHanging = item.kind === 'hanging';
  const isLight = item.kind === 'light';
  const canYaw = !isHanging && !isLight;
  const wallSnapped = !!item.wallMounted;

  // Sit just above the top of the piece (position is floor-plane footprint center).
  const maxDim = Math.max(item.size[0], item.size[1], item.size[2], 8);
  const liftAbove = Math.min(14, Math.max(3, maxDim * 0.22 + 2));
  const labelAnchor: [number, number, number] = [
    item.position[0],
    item.position[1] + item.size[1] + liftAbove,
    item.position[2],
  ];
  const snapChipAnchor: [number, number, number] = [
    item.position[0],
    item.position[1] + item.size[1] * 0.5,
    item.position[2] + Math.max(item.size[2], 8) * 0.55 + 4,
  ];

  const swatch = kindSwatch(item.kind);
  const rotDeg = Math.round((((item.rotationY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 180) / Math.PI);

  const nudgeRot = (dir: 1 | -1) => {
    const live = useStore.getState().items[item.id];
    if (!live || live.kind === 'hanging' || live.kind === 'light') return;
    updateRotation(live.id, live.rotationY + dir * ROT_STEP);
  };

  const showRotate = !radialOpen && canYaw;

  return (
    <>
      <Html
        position={labelAnchor}
        center
        zIndexRange={[80, 0]}
        style={{ pointerEvents: 'none' }}
        onPointerDown={stopOrbit}
        onPointerUp={stopOrbit}
      >
        <div
          className="dg-hud"
          onPointerDown={stopOrbit}
          onPointerUp={stopOrbit}
          onClick={stopOrbit}
        >
          <div className="dg-hud-label">
            <div className="dg-hud-label__main">
              <span className="dg-hud-label__dot" style={{ background: swatch }} />
              <span className="dg-hud-label__name">{displayName}</span>
            </div>
            <HudBtn
              className="dg-hud-label__action"
              title="Actions"
              onClick={onToggleRadial}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="6" cy="12" r="1.4" fill="currentColor" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" />
                <circle cx="18" cy="12" r="1.4" fill="currentColor" />
              </svg>
              <span>Actions</span>
            </HudBtn>
          </div>

          {showRotate ? (
            <div
              className="dg-hud-handle dg-hud-handle--under"
              onPointerDown={stopOrbit}
              onPointerUp={stopOrbit}
            >
              <HudBtn title="Rotate left 15°" onClick={() => nudgeRot(-1)}>
                <RotateGlyph dir="left" />
              </HudBtn>
              <span className="dg-hud-handle__value">{rotDeg}°</span>
              <HudBtn title="Rotate right 15°" onClick={() => nudgeRot(1)}>
                <RotateGlyph dir="right" />
              </HudBtn>
            </div>
          ) : null}

          {radialOpen ? (
            <div className="dg-hud-radial">
              <div className="dg-hud-radial__card">
                {isHanging ? (
                  <>
                    <HudBtn
                      className="dg-hud-radial__btn is-danger"
                      title="Remove"
                      onClick={() => removeItem(item.id)}
                    >
                      <RadialIcon kind="remove" />
                      <span>Remove</span>
                    </HudBtn>
                    <HudBtn
                      className="dg-hud-radial__detail"
                      title={detailLabel(item.kind)}
                      onClick={onOpenInspector}
                    >
                      <span>{detailLabel(item.kind)}</span>
                      <span className="dg-hud-kbd">↵</span>
                    </HudBtn>
                  </>
                ) : (
                  <>
                    <HudBtn
                      className="dg-hud-radial__btn"
                      title="Resize"
                      onClick={onOpenInspector}
                    >
                      <RadialIcon kind="resize" />
                      <span>Resize</span>
                    </HudBtn>
                    {canYaw ? (
                      <HudBtn
                        className="dg-hud-radial__btn"
                        title="Rotate 15°"
                        onClick={() => nudgeRot(1)}
                      >
                        <RadialIcon kind="rotate" />
                        <span>Rotate</span>
                      </HudBtn>
                    ) : null}
                    <HudBtn
                      className="dg-hud-radial__btn"
                      title="Duplicate"
                      onClick={() => duplicateItem(item.id)}
                    >
                      <RadialIcon kind="duplicate" />
                      <span>Duplicate</span>
                    </HudBtn>
                    <HudBtn
                      className="dg-hud-radial__btn is-danger"
                      title="Remove"
                      onClick={() => removeItem(item.id)}
                    >
                      <RadialIcon kind="remove" />
                      <span>Remove</span>
                    </HudBtn>
                    <HudBtn
                      className="dg-hud-radial__detail"
                      title={detailLabel(item.kind)}
                      onClick={onOpenInspector}
                    >
                      <span>{detailLabel(item.kind)}</span>
                      <span className="dg-hud-kbd">↵</span>
                    </HudBtn>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Html>

      {wallSnapped ? (
        <Html
          position={snapChipAnchor}
          center
          style={{ pointerEvents: 'none' }}
          zIndexRange={[55, 0]}
        >
          <div className="dg-hud-chip">SNAPPED · WALL</div>
        </Html>
      ) : null}
    </>
  );
}

function RotateGlyph({ dir }: { dir: 'left' | 'right' }) {
  const flip = dir === 'left';
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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

function RadialIcon({ kind }: { kind: 'resize' | 'rotate' | 'duplicate' | 'remove' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  if (kind === 'resize') {
    return (
      <svg {...common}>
        <path d="M9 15l-4 4M5 14.5V19h4.5M15 9l4-4M19 9.5V5h-4.5" />
      </svg>
    );
  }
  if (kind === 'rotate') {
    return (
      <svg {...common}>
        <path d="M20 12a8 8 0 1 1-2.4-5.7" />
        <path d="M20 4v4h-4" />
      </svg>
    );
  }
  if (kind === 'duplicate') {
    return (
      <svg {...common}>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 5H6a2 2 0 0 0-2 2v9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 7h14M9 7V5h6v2M6.5 7l.9 12.1h9.2L17.5 7" />
    </svg>
  );
}
