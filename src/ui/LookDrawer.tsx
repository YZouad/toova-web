import { useEffect, useState } from 'react';
import { WALL_COLOR_SWATCHES } from '../lib/roomAppearance';
import {
  CEILING_PRESET_OPTIONS,
  FLOOR_PRESET_OPTIONS,
  TRIM_PRESET_OPTIONS,
  materialLabel,
  type MaterialPresetId,
} from '../lib/roomMaterials';
import {
  RENDER_QUALITY_TIERS,
  qualityLabel,
  type CameraPresetId,
  type CutawayMode,
  type RenderQualityTier,
} from '../lib/renderQuality';
import { useStore } from '../store';
import { GlassSurface } from './GlassSurface';

const CAMERA_OPTIONS: { id: CameraPresetId; label: string }[] = [
  { id: 'corner', label: 'Corner' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'window', label: 'Window' },
  { id: 'topDown', label: 'Top-down' },
];

const CUTAWAY_OPTIONS: { id: CutawayMode; label: string }[] = [
  { id: 'orbit', label: 'Orbit fade' },
  { id: 'openFront', label: 'Open front' },
  { id: 'topDown', label: 'Top-down' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="look-section">
      <h3 className="look-section-title">{title}</h3>
      <div className="look-section-body">{children}</div>
    </section>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="look-field">
      <span className="look-field-label">{label}</span>
      <select
        className="look-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function WallColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="look-wall-color">
      <span className="look-field-label">Wall paint</span>
      <div className="look-wall-color-row">
        <input
          type="color"
          className="look-color-swatch-input"
          value={value.length === 7 ? value : '#d8d0c2'}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Wall color"
        />
        <input
          type="text"
          className="look-hex-input"
          value={draft}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onChange(v);
          }}
          spellCheck={false}
          aria-label="Wall color hex"
        />
      </div>
      <div className="look-swatches">
        {WALL_COLOR_SWATCHES.map((s) => (
          <button
            key={s.color}
            type="button"
            title={s.label}
            aria-label={s.label}
            className={`look-swatch${value.toLowerCase() === s.color.toLowerCase() ? ' active' : ''}`}
            style={{ background: s.color }}
            onClick={() => onChange(s.color)}
          />
        ))}
      </div>
    </div>
  );
}

interface LookDrawerProps {
  open: boolean;
  onClose: () => void;
  onGoToPreset: (id: CameraPresetId) => void;
  onOpenExport: () => void;
  onEditFloorPlan?: () => void;
}

/** Surfaces, shell, camera — opened from the Atmosphere strip “Look” button. */
export function LookDrawer({
  open,
  onClose,
  onGoToPreset,
  onOpenExport,
  onEditFloorPlan,
}: LookDrawerProps) {
  const appearance = useStore((s) => s.environment.appearance);
  const setAppearance = useStore((s) => s.setAppearance);
  const visual = useStore((s) => s.visual);
  const setVisualQuality = useStore((s) => s.setVisualQuality);
  const setCutaway = useStore((s) => s.setCutaway);
  const setCameraPreset = useStore((s) => s.setCameraPreset);
  const roomGeometry = useStore((s) => s.roomGeometry);
  const setRoomHeight = useStore((s) => s.setRoomHeight);

  if (!open) return null;

  const doors = roomGeometry.openings.filter((o) => o.kind === 'door').length;
  const windows = roomGeometry.openings.filter((o) => o.kind === 'window').length;

  return (
    <GlassSurface className="look-drawer" as="section">
      <div id="look-drawer" className="look-drawer-inner">
        <header className="look-drawer-header">
          <div>
            <p className="look-drawer-eyebrow">Room look</p>
            <h2 className="look-drawer-title">Surfaces &amp; view</h2>
          </div>
          <button type="button" className="look-drawer-close" onClick={onClose} aria-label="Close look panel">
            ✕
          </button>
        </header>

        <div className="look-drawer-actions">
          <button type="button" className="look-action" onClick={onOpenExport}>
            Export render
          </button>
        </div>

        <Section title="Surfaces">
          <WallColorPicker
            value={appearance.wallColor}
            onChange={(wallColor) => setAppearance({ wallColor })}
          />
          <FieldSelect
            label="Floor"
            value={appearance.floorPreset}
            options={FLOOR_PRESET_OPTIONS.map((id) => ({ id, label: materialLabel(id) }))}
            onChange={(id) => setAppearance({ floorPreset: id as MaterialPresetId })}
          />
          <FieldSelect
            label="Ceiling"
            value={appearance.ceilingPreset}
            options={CEILING_PRESET_OPTIONS.map((id) => ({ id, label: materialLabel(id) }))}
            onChange={(id) => setAppearance({ ceilingPreset: id as MaterialPresetId })}
          />
          <FieldSelect
            label="Trim"
            value={appearance.trimPreset}
            options={TRIM_PRESET_OPTIONS.map((id) => ({ id, label: materialLabel(id) }))}
            onChange={(id) => setAppearance({ trimPreset: id as MaterialPresetId })}
          />
        </Section>

        <Section title="Shell">
          <div className="look-toggle-row">
            <button
              type="button"
              className={`look-toggle${appearance.showBaseboards ? ' active' : ''}`}
              aria-pressed={appearance.showBaseboards}
              onClick={() => setAppearance({ showBaseboards: !appearance.showBaseboards })}
            >
              Baseboards
            </button>
            <button
              type="button"
              className={`look-toggle${appearance.recessedLights ? ' active' : ''}`}
              aria-pressed={appearance.recessedLights}
              onClick={() => setAppearance({ recessedLights: !appearance.recessedLights })}
            >
              Ceiling lights
            </button>
          </div>
          <label className="look-field">
            <span className="look-field-label">Height</span>
            <div className="look-height-row">
              <input
                type="range"
                className="atmosphere-slider"
                min={72}
                max={144}
                step={2}
                value={roomGeometry.height}
                onChange={(e) => setRoomHeight(Number(e.target.value))}
              />
              <span className="look-height-val">{Math.round(roomGeometry.height)}″</span>
            </div>
          </label>
          {onEditFloorPlan ? (
            <button type="button" className="look-action look-action--block" onClick={onEditFloorPlan}>
              Edit floor plan
            </button>
          ) : null}
          <p className="look-plan-meta">
            {roomGeometry.walls.length} walls · {doors} doors · {windows} windows
          </p>
        </Section>

        <Section title="View">
          <FieldSelect
            label="Camera"
            value={visual.cameraPreset}
            options={CAMERA_OPTIONS}
            onChange={(id) => {
              const preset = id as CameraPresetId;
              setCameraPreset(preset);
              onGoToPreset(preset);
            }}
          />
          <FieldSelect
            label="Cutaway"
            value={visual.cutaway}
            options={CUTAWAY_OPTIONS}
            onChange={(id) => setCutaway(id as CutawayMode)}
          />
          <FieldSelect
            label="Quality"
            value={visual.quality}
            options={RENDER_QUALITY_TIERS.map((t) => ({ id: t, label: qualityLabel(t) }))}
            onChange={(id) => setVisualQuality(id as RenderQualityTier)}
          />
        </Section>
      </div>
    </GlassSurface>
  );
}
