import { useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  DEFAULT_MATTRESS_COLOR,
  FURNITURE_FINISH_SWATCHES,
  MATTRESS_COLOR_SWATCHES,
  defaultFinishColor,
  dresserTopColor,
  finishColor,
  itemUsesCustomFinish,
  mattressColor,
} from '../../lib/furnitureFinish';
import {
  removeFurnitureFinishTexture,
  uploadFurnitureFinishTexture,
} from '../../lib/furnitureFinishStorage';
import { DEFAULT_RUG_COLOR, isChecklistRug } from '../../lib/checklistPublicGlbs';
import { DEFAULT_SHELF_COLOR, SHELF_COLOR_SWATCHES } from '../../furniture/registry';
import { useStore, type Item } from '../../store';
import { PanelSection } from './PanelShell';

export function FinishTab({
  item,
  compact = false,
}: {
  item: Item;
  compact?: boolean;
}) {
  const setTintColor = useStore((s) => s.setTintColor);
  const isCustom = itemUsesCustomFinish(item.kind);
  const isShelf = item.kind === 'shelf';
  const isRug = item.kind === 'imported' && isChecklistRug(item);
  const canTint = isShelf || isRug || item.kind === 'imported';

  if (isCustom) {
    return <BuiltinFinishEditor item={item} compact={compact} />;
  }

  if (!canTint) {
    if (compact) {
      return (
        <p className="dgm-note">
          Finish options depend on the piece. Lamps keep their own materials.
        </p>
      );
    }
    return (
      <div className="dg-note">
        Finish options depend on the piece. Lamps keep their own materials.
      </div>
    );
  }

  const swatches = isShelf
    ? SHELF_COLOR_SWATCHES
    : [
        { label: 'Natural', color: DEFAULT_RUG_COLOR },
        { label: 'Sage', color: '#6b7f6a' },
        { label: 'Terracotta', color: '#C98A6B' },
        { label: 'Charcoal', color: '#3a3a3a' },
        { label: 'Cream', color: '#FBF7F0' },
      ];
  const current = item.tintColor ?? (isShelf ? DEFAULT_SHELF_COLOR : DEFAULT_RUG_COLOR);

  const swatchRow = (
    <div className={compact ? 'dgm-swatch-row' : 'dg-swatch-grid'}>
      {swatches.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${compact ? 'dgm-swatch' : 'dg-swatch'}${current.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          onClick={() => setTintColor(item.id, s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : undefined}
        value={current.length === 7 ? current : '#a98662'}
        onChange={(e) => setTintColor(item.id, e.target.value)}
        aria-label="Custom tint"
        style={compact ? undefined : { width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }}
      />
    </div>
  );

  if (compact) {
    return (
      <section className="dgm-section">
        <h3 className="dgm-section-title">Frame color</h3>
        {swatchRow}
        {item.kind === 'imported' && !isRug ? (
          <p className="dgm-note">Imported models keep their own materials; tint multiplies the mesh color.</p>
        ) : null}
      </section>
    );
  }

  return (
    <PanelSection title="Frame color">
      {swatchRow}
      {item.kind === 'imported' && !isRug ? (
        <p style={{ font: '400 12px/1.5 var(--font-sans)', color: 'var(--ink-4)', margin: '8px 0 0' }}>
          Imported models keep their own materials; tint multiplies the mesh color.
        </p>
      ) : null}
    </PanelSection>
  );
}

function BuiltinFinishEditor({ item, compact }: { item: Item; compact: boolean }) {
  const { user } = useAuth();
  const setTintColor = useStore((s) => s.setTintColor);
  const setMattressColor = useStore((s) => s.setMattressColor);
  const setTopColor = useStore((s) => s.setTopColor);
  const setFinishTexture = useStore((s) => s.setFinishTexture);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = finishColor(item);
  const mattress = mattressColor(item.mattressColor);
  const top = dresserTopColor(item.topColor, current);
  const hasPhoto = Boolean(item.finishTextureUrl || item.finishTexturePath);
  const isDresser = item.kind === 'dresser';

  const applySwatch = (hex: string) => {
    setError(null);
    const oldPath = item.finishTexturePath;
    setTintColor(item.id, hex);
    setFinishTexture(item.id, null);
    if (oldPath) void removeFurnitureFinishTexture(oldPath).catch(() => undefined);
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose a jpg, png, or webp.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFurnitureFinishTexture(file);
      const oldPath = item.finishTexturePath;
      setFinishTexture(item.id, { path: uploaded.path, url: uploaded.signedUrl });
      if (oldPath && oldPath !== uploaded.path) {
        void removeFurnitureFinishTexture(oldPath).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload texture');
    } finally {
      setBusy(false);
    }
  };

  const onRemovePhoto = () => {
    const oldPath = item.finishTexturePath;
    setFinishTexture(item.id, null);
    if (oldPath) void removeFurnitureFinishTexture(oldPath).catch(() => undefined);
    if (!item.tintColor) setTintColor(item.id, defaultFinishColor(item.kind));
  };

  const swatches = (
    <div className={compact ? 'dgm-swatch-row' : 'dg-swatch-grid'}>
      {FURNITURE_FINISH_SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${compact ? 'dgm-swatch' : 'dg-swatch'}${!hasPhoto && current.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          onClick={() => applySwatch(s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : undefined}
        value={current.length === 7 ? current : defaultFinishColor(item.kind)}
        onChange={(e) => applySwatch(e.target.value)}
        aria-label="Custom color"
        style={compact ? undefined : { width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }}
      />
    </div>
  );

  const topSwatches = (
    <div className={compact ? 'dgm-swatch-row' : 'dg-swatch-grid'}>
      {FURNITURE_FINISH_SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${compact ? 'dgm-swatch' : 'dg-swatch'}${top.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          onClick={() => setTopColor(item.id, s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : undefined}
        value={top.length === 7 ? top : current}
        onChange={(e) => setTopColor(item.id, e.target.value)}
        aria-label="Top color"
        style={compact ? undefined : { width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }}
      />
    </div>
  );

  const mattressSwatches = (
    <div className={compact ? 'dgm-swatch-row' : 'dg-swatch-grid'}>
      {MATTRESS_COLOR_SWATCHES.map((s) => (
        <button
          key={s.color}
          type="button"
          className={`${compact ? 'dgm-swatch' : 'dg-swatch'}${mattress.toLowerCase() === s.color.toLowerCase() ? ' is-active' : ''}`}
          style={{ background: s.color }}
          title={s.label}
          aria-label={s.label}
          onClick={() => setMattressColor(item.id, s.color)}
        />
      ))}
      <input
        type="color"
        className={compact ? 'dgm-color-input' : undefined}
        value={mattress.length === 7 ? mattress : DEFAULT_MATTRESS_COLOR}
        onChange={(e) => setMattressColor(item.id, e.target.value)}
        aria-label="Mattress color"
        style={compact ? undefined : { width: 36, height: 36, border: 'none', padding: 0, background: 'transparent' }}
      />
    </div>
  );

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
      {hasPhoto && item.finishTextureUrl ? (
        <img src={item.finishTextureUrl} alt="Furniture texture" className="dg-finish-photo__preview" />
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
            onClick={onRemovePhoto}
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className={compact ? 'dgm-note' : 'dg-finish-photo__hint'}>
        {user
          ? item.kind === 'bed'
            ? 'Wrap the bed frame with a photo of real wood or laminate. Sheets and blankets stay on the Bedding tab.'
            : 'Wrap this piece with a photo of real wood or laminate. A close-up of the surface looks best.'
          : 'Sign in to wrap this piece with a photo of real wood or laminate.'}
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
      <div className="dgm-stack">
        <section className="dgm-section">
          <h3 className="dgm-section-title">
            {item.kind === 'bed' ? 'Frame color' : isDresser ? 'Base color' : 'Color'}
          </h3>
          {swatches}
        </section>
        {isDresser ? (
          <section className="dgm-section">
            <h3 className="dgm-section-title">Top color</h3>
            {topSwatches}
          </section>
        ) : null}
        {item.kind === 'bed' ? (
          <section className="dgm-section">
            <h3 className="dgm-section-title">Mattress color</h3>
            {mattressSwatches}
          </section>
        ) : null}
        <section className="dgm-section">
          <h3 className="dgm-section-title">Photo wrap</h3>
          {photo}
        </section>
      </div>
    );
  }

  return (
    <div>
      <PanelSection
        title={item.kind === 'bed' ? 'Frame color' : isDresser ? 'Base color' : 'Color'}
        meta={hasPhoto ? 'Photo wrap on' : undefined}
      >
        {swatches}
      </PanelSection>
      {isDresser ? (
        <PanelSection title="Top color">
          {topSwatches}
        </PanelSection>
      ) : null}
      {item.kind === 'bed' ? (
        <PanelSection title="Mattress color">
          {mattressSwatches}
        </PanelSection>
      ) : null}
      <PanelSection title="Photo wrap">
        {photo}
      </PanelSection>
    </div>
  );
}
