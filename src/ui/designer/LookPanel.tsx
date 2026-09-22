import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  WALL_COLOR_SWATCHES,
  uniqueWallLabels,
  wallPaintColor,
} from '../../lib/roomAppearance';
import { removeFloorTexture, uploadFloorTexture } from '../../lib/roomFloorStorage';
import { allWallSegments } from '../../lib/roomGeometry';
import {
  FLOOR_PRESET_OPTIONS,
  MATERIAL_PRESETS,
  TRIM_PRESET_OPTIONS,
  materialLabel,
} from '../../lib/roomMaterials';
import { useStore } from '../../store';
import { PanelSection, PanelShell } from './PanelShell';

export interface LookPanelProps {
  compact?: boolean;
  onClose: () => void;
}

export function LookPanel({ compact, onClose }: LookPanelProps) {
  const appearance = useStore((s) => s.environment.appearance);
  const setAppearance = useStore((s) => s.setAppearance);

  return (
    <PanelShell
      compact={compact}
      mobileHeight="mid"
      title="Room look"
      onClose={onClose}
    >
      <WallPaintControls compact={false} />

      <PanelSection
        title="Flooring"
        meta={
          appearance.floorTexturePath
            ? 'Custom photo'
            : materialLabel(appearance.floorPreset)
        }
      >
        <div className="dg-mat-grid">
          {FLOOR_PRESET_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={`dg-mat-card${appearance.floorPreset === id ? ' is-active' : ''}`}
              onClick={() => setAppearance({ floorPreset: id })}
            >
              <span className={`dg-mat-card__preview dg-mat-card__preview--${id}`} />
              <span className="dg-mat-card__label">{materialLabel(id)}</span>
            </button>
          ))}
        </div>
        <FloorTextureControls compact={false} />
      </PanelSection>

      <PanelSection title="Trim & baseboards" meta={materialLabel(appearance.trimPreset)}>
        <div className="dg-swatch-grid">
          {TRIM_PRESET_OPTIONS.map((id) => (
            <button
              key={id}
              type="button"
              className={`dg-swatch${appearance.trimPreset === id ? ' is-active' : ''}`}
              style={{ background: MATERIAL_PRESETS[id].color }}
              title={materialLabel(id)}
              aria-label={materialLabel(id)}
              onClick={() => setAppearance({ trimPreset: id })}
            />
          ))}
        </div>
        <div className="dg-row dg-row--between">
          <span className="dg-row__label">Show baseboards</span>
          <button
            type="button"
            className={`dg-toggle${appearance.showBaseboards ? ' is-on' : ''}`}
            aria-pressed={appearance.showBaseboards}
            aria-label="Show baseboards"
            onClick={() => setAppearance({ showBaseboards: !appearance.showBaseboards })}
          />
        </div>
      </PanelSection>

      <p className="dg-note">Changing the look never moves your furniture.</p>
    </PanelShell>
  );
}

export function FloorTextureControls({ compact }: { compact: boolean }) {
  const { user } = useAuth();
  const appearance = useStore((s) => s.environment.appearance);
  const setFloorTexture = useStore((s) => s.setFloorTexture);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPhoto = Boolean(appearance.floorTextureUrl || appearance.floorTexturePath);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose a jpg, png, or webp.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFloorTexture(file);
      const oldPath = appearance.floorTexturePath;
      setFloorTexture({ path: uploaded.path, url: uploaded.signedUrl });
      if (oldPath && oldPath !== uploaded.path) {
        void removeFloorTexture(oldPath).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload texture');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = () => {
    const oldPath = appearance.floorTexturePath;
    setFloorTexture(null);
    if (oldPath) void removeFloorTexture(oldPath).catch(() => undefined);
  };

  const photo = (
    <div className="dg-finish-photo">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="dg-finish-photo__input"
        disabled={busy || !user}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void onPick(file);
        }}
      />
      {hasPhoto && appearance.floorTextureUrl ? (
        <img src={appearance.floorTextureUrl} alt="Floor texture" className="dg-finish-photo__preview" />
      ) : null}
      <div className="dg-finish-photo__actions">
        <button
          type="button"
          className={compact ? 'dgm-action-btn' : 'dg-footer-btn'}
          disabled={busy || !user}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Uploading…' : hasPhoto ? 'Replace photo' : 'Upload photo'}
        </button>
        {hasPhoto ? (
          <button
            type="button"
            className={compact ? 'dgm-action-btn' : 'dg-footer-btn'}
            disabled={busy}
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className={compact ? 'dgm-note' : 'dg-finish-photo__hint'}>
        {user
          ? 'Use a photo of real carpet or flooring. A flat, even shot tiles best across the room.'
          : 'Sign in to wrap the floor with a photo of real carpet or flooring.'}
      </p>
      {error ? (
        <p className={compact ? 'dgm-note' : 'dg-finish-photo__error'} role="status">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <section className="dgm-section">
        <h3 className="dgm-section-title">Floor photo</h3>
        {photo}
      </section>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="dg-row__label" style={{ margin: '0 0 8px' }}>
        Floor photo
      </p>
      {photo}
    </div>
  );
}

export function WallPaintControls({ compact }: { compact: boolean }) {
  const appearance = useStore((s) => s.environment.appearance);
  const geom = useStore((s) => s.roomGeometry);
  const selectedWallId = useStore((s) => s.selectedWallId);
  const selectWall = useStore((s) => s.selectWall);
  const setWallPaint = useStore((s) => s.setWallPaint);

  const walls = useMemo(
    () =>
      uniqueWallLabels(
        allWallSegments(geom).map((seg) => ({ id: seg.wall.id, outward: seg.outward })),
      ),
    [geom],
  );

  const paintWallId = selectedWallId && walls.some((w) => w.id === selectedWallId) ? selectedWallId : null;
  const current = paintWallId ? wallPaintColor(appearance, paintWallId) : appearance.wallColor;
  const currentHex = current.length === 7 ? current : '#d8d0c2';
  const activeWall = paintWallId ? walls.find((w) => w.id === paintWallId) : null;

  const apply = (color: string) => setWallPaint(color, paintWallId);

  const swatches = (
    <div className={compact ? 'dgm-swatch-row' : 'dg-swatch-grid'}>
      {WALL_COLOR_SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${compact ? 'dgm-swatch' : 'dg-swatch'}${current.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          aria-pressed={current.toLowerCase() === s.color.toLowerCase()}
          onClick={() => apply(s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : 'dg-color-input'}
        value={currentHex}
        onChange={(e) => apply(e.target.value)}
        aria-label="Custom wall color"
      />
    </div>
  );

  const chips =
    walls.length > 1 ? (
      <div className={compact ? 'dgm-chip-row' : 'dg-chip-row'} role="group" aria-label="Paint target">
        <button
          type="button"
          className={`${compact ? 'dgm-chip' : 'dg-chip'}${paintWallId === null ? ' is-active' : ''}`}
          aria-pressed={paintWallId === null}
          onClick={() => selectWall(null)}
        >
          All walls
        </button>
        {walls.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`${compact ? 'dgm-chip' : 'dg-chip'}${paintWallId === w.id ? ' is-active' : ''}`}
            aria-pressed={paintWallId === w.id}
            title={w.title}
            aria-label={w.title}
            onClick={() => selectWall(w.id)}
          >
            <span
              className={compact ? 'dgm-wall-dot' : 'dg-wall-dot'}
              style={{ background: wallPaintColor(appearance, w.id) }}
              aria-hidden
            />
            {w.label}
          </button>
        ))}
      </div>
    ) : null;

  if (compact) {
    return (
      <section className="dgm-section">
        <div className="dgm-section-head">
          <h3 className="dgm-section-title">Wall paint</h3>
          <span className="dgm-section-meta">{activeWall?.title ?? 'All walls'}</span>
        </div>
        {chips}
        {swatches}
        {walls.length > 1 ? (
          <p className="dgm-note">Tap a wall in the room, or a chip, to paint just that one.</p>
        ) : null}
      </section>
    );
  }

  return (
    <PanelSection title="Wall paint" meta={activeWall?.title ?? 'All walls'}>
      {chips}
      {swatches}
      {walls.length > 1 ? (
        <p className="dg-look-hint">Click a wall in the room, or a chip, to paint just that one.</p>
      ) : null}
    </PanelSection>
  );
}
