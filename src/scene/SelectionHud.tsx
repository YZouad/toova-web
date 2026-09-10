import { Html } from '@react-three/drei';
import { useEffect, useState, type ReactNode } from 'react';
import {
  LED_PALETTE_PRESETS,
  palettePresetBackground,
  toColorInputValue,
  type HangingDecorationConfig,
} from '../lib/hangingDecorGeometry';
import { useStore, type HangingDecorKind } from '../store';

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

function stopOrbitBubble(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

function kindSwatch(kind: string): string {
  return KIND_COLORS[kind] ?? KIND_COLORS.default;
}

function detailLabel(kind: string): string {
  if (kind === 'bed') return 'Bedding & details';
  if (kind === 'light') return 'Light settings';
  return 'Edit details';
}

function hangingAccentLabel(kind: HangingDecorKind | undefined): string {
  if (kind === 'leaves') return 'Leaves';
  if (kind === 'led-strip') return 'Colors';
  return 'Bulbs';
}

function hangingAccentIcon(kind: HangingDecorKind | undefined): 'bulbs' | 'leaves' | 'led' {
  if (kind === 'leaves') return 'leaves';
  if (kind === 'led-strip') return 'led';
  return 'bulbs';
}

function HangSlider({
  label,
  meta,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  meta: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="dg-hud-hang__row">
      <span className="dg-hud-hang__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={stopOrbitBubble}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="dg-hud-hang__meta">{meta}</span>
    </label>
  );
}

function HangingHudSheet({
  sheet,
  hang,
  onPatch,
  onRedraw,
}: {
  sheet: 'path' | 'bulbs';
  hang: HangingDecorationConfig;
  onPatch: (patch: Partial<HangingDecorationConfig>) => void;
  onRedraw: () => void;
}) {
  const lit = hang.kind === 'lights' || hang.kind === 'led-strip';

  return (
    <div className="dg-hud-hang" role="region" aria-label={sheet === 'path' ? 'Path' : hangingAccentLabel(hang.kind)}>
      {sheet === 'path' ? (
        <>
          <div className="dg-hud-hang__head">
            <span>
              {hang.anchors.length} anchor{hang.anchors.length === 1 ? '' : 's'}
            </span>
            <button type="button" className="dg-hud-hang__redraw" onPointerDown={stopOrbit} onClick={onRedraw}>
              Redraw
            </button>
          </div>
          {hang.kind !== 'led-strip' ? (
            <HangSlider
              label="Sag"
              meta={`${Math.round(hang.sag * 100)}%`}
              min={0}
              max={45}
              step={1}
              value={Math.round(hang.sag * 100)}
              onChange={(v) => onPatch({ sag: v / 100 })}
            />
          ) : null}
        </>
      ) : lit ? (
        <>
          <HangSlider
            label="Spacing"
            meta={`${hang.density.toFixed(1)}″`}
            min={2}
            max={18}
            step={0.5}
            value={hang.density}
            onChange={(v) => onPatch({ density: v })}
          />
          <HangSlider
            label="Glow"
            meta={hang.lightIntensity.toFixed(1)}
            min={0.2}
            max={3}
            step={0.1}
            value={hang.lightIntensity}
            onChange={(v) => onPatch({ lightIntensity: v })}
          />
          <div className="dg-hud-hang__swatches" role="group" aria-label="Colors">
            {LED_PALETTE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                title={p.label}
                aria-label={p.label}
                className="dg-hud-hang__swatch"
                style={{ background: palettePresetBackground(p.colors) }}
                onPointerDown={stopOrbit}
                onClick={() => onPatch({ palette: [...p.colors] })}
              />
            ))}
            <input
              type="color"
              className="dg-hud-hang__custom"
              aria-label="Custom color"
              title="Custom color"
              value={toColorInputValue(hang.palette[0] ?? '#fff4e0')}
              onPointerDown={stopOrbitBubble}
              onChange={(e) => onPatch({ palette: [e.target.value] })}
            />
          </div>
        </>
      ) : (
        <HangSlider
          label="Fullness"
          meta={`${hang.density.toFixed(2)}×`}
          min={0.4}
          max={2}
          step={0.05}
          value={hang.density}
          onChange={(v) => onPatch({ density: v })}
        />
      )}
    </div>
  );
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
  const setHangingConfig = useStore((s) => s.setHangingConfig);
  const beginHangingDraft = useStore((s) => s.beginHangingDraft);
  const [hangSheet, setHangSheet] = useState<'path' | 'bulbs' | null>(null);

  useEffect(() => {
    if (!radialOpen) setHangSheet(null);
  }, [radialOpen]);

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
      >
        <div className="dg-hud">
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
            <div className="dg-hud-handle dg-hud-handle--under">
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
            <div className={`dg-hud-radial${isHanging ? ' is-hanging' : ''}${hangSheet ? ' has-sheet' : ''}`}>
              <div className={`dg-hud-radial__card${isHanging ? ' is-hanging' : ''}`}>
                {isHanging ? (
                  <>
                    <HudBtn
                      className={`dg-hud-radial__btn${hangSheet === 'path' ? ' is-active' : ''}`}
                      title="Path"
                      onClick={() => setHangSheet((s) => (s === 'path' ? null : 'path'))}
                    >
                      <RadialIcon kind="path" />
                      <span>Path</span>
                    </HudBtn>
                    <HudBtn
                      className={`dg-hud-radial__btn${hangSheet === 'bulbs' ? ' is-active' : ''}`}
                      title={hangingAccentLabel(item.hanging?.kind)}
                      onClick={() => setHangSheet((s) => (s === 'bulbs' ? null : 'bulbs'))}
                    >
                      <RadialIcon kind={hangingAccentIcon(item.hanging?.kind)} />
                      <span>{hangingAccentLabel(item.hanging?.kind)}</span>
                    </HudBtn>
                    <HudBtn
                      className="dg-hud-radial__btn is-danger"
                      title="Remove"
                      onClick={() => removeItem(item.id)}
                    >
                      <RadialIcon kind="remove" />
                      <span>Remove</span>
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
              {isHanging && hangSheet && item.hanging ? (
                <HangingHudSheet
                  sheet={hangSheet}
                  hang={item.hanging}
                  onPatch={(patch) => setHangingConfig(item.id, patch)}
                  onRedraw={() => beginHangingDraft(item.hanging!.kind)}
                />
              ) : null}
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

function RadialIcon({
  kind,
}: {
  kind: 'resize' | 'rotate' | 'duplicate' | 'remove' | 'path' | 'bulbs' | 'leaves' | 'led';
}) {
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
  if (kind === 'path') {
    return (
      <svg {...common}>
        <circle cx="4.5" cy="7" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19.5" cy="7" r="1.4" fill="currentColor" stroke="none" />
        <path d="M4.5 7c3.2 9 11.8 9 15 0" />
      </svg>
    );
  }
  if (kind === 'bulbs') {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M7 6v3.2M12 6v4.4M17 6v3.2" />
        <circle cx="7" cy="12.2" r="2" />
        <circle cx="12" cy="13.6" r="2" />
        <circle cx="17" cy="12.2" r="2" />
      </svg>
    );
  }
  if (kind === 'leaves') {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M8 6v2.2M12 6v2.6M16 6v2" />
        <path d="M8 8.2c-2.4 1.3-2.6 4.1-1 5.8 1.9-.9 2.3-3.4 1-5.8" />
        <path d="M12 8.6c-2.6 1.5-2.8 4.6-1.1 6.6 2-1 2.4-4 1.1-6.6" />
        <path d="M16 8c2.3 1.2 2.5 3.8 1 5.5-1.8-.8-2.1-3.1-1-5.5" />
      </svg>
    );
  }
  if (kind === 'led') {
    return (
      <svg {...common}>
        <path d="M4 12h16" strokeWidth="2.4" />
        <rect x="6" y="10.4" width="2.4" height="3.2" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="10.8" y="10.4" width="2.4" height="3.2" rx="0.5" fill="currentColor" stroke="none" />
        <rect x="15.6" y="10.4" width="2.4" height="3.2" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 7h14M9 7V5h6v2M6.5 7l.9 12.1h9.2L17.5 7" />
    </svg>
  );
}
