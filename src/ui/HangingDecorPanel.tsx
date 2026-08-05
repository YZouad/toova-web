import { LED_PALETTE_PRESETS } from '../lib/hangingDecorGeometry';
import { useStore } from '../store';

interface Props {
  onClose: () => void;
}

export function HangingDecorPanel({ onClose }: Props) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const setHangingConfig = useStore((s) => s.setHangingConfig);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);
  const beginHangingDraft = useStore((s) => s.beginHangingDraft);

  if (!item || item.kind !== 'hanging' || !item.hanging) return null;
  const cfg = item.hanging;
  const isLights = cfg.kind === 'lights';

  return (
    <aside className="designer-advanced tv-scroll hang-panel" aria-label="Hanging decoration settings">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          {isLights ? 'String lights' : 'Hanging leaves'}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            cursor: 'pointer',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: '#fff',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          ✕
        </button>
      </div>

      <label className="hang-field">
        <span>Sag</span>
        <input
          type="range"
          min={0}
          max={45}
          step={1}
          value={Math.round(cfg.sag * 100)}
          onChange={(e) => setHangingConfig(item.id, { sag: Number(e.target.value) / 100 })}
        />
        <span className="hang-field-value">{Math.round(cfg.sag * 100)}%</span>
      </label>

      {isLights ? (
        <>
          <label className="hang-field">
            <span>Bulb spacing</span>
            <input
              type="range"
              min={2}
              max={18}
              step={0.5}
              value={cfg.density}
              onChange={(e) => setHangingConfig(item.id, { density: Number(e.target.value) })}
            />
            <span className="hang-field-value">{cfg.density.toFixed(1)}″</span>
          </label>

          <label className="hang-field">
            <span>Brightness</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={cfg.lightIntensity}
              onChange={(e) =>
                setHangingConfig(item.id, { lightIntensity: Number(e.target.value) })
              }
            />
            <span className="hang-field-value">{cfg.lightIntensity.toFixed(1)}</span>
          </label>

          <label className="hang-field">
            <span>Light range</span>
            <input
              type="range"
              min={16}
              max={120}
              step={4}
              value={cfg.lightRange}
              onChange={(e) => setHangingConfig(item.id, { lightRange: Number(e.target.value) })}
            />
            <span className="hang-field-value">{Math.round(cfg.lightRange)}″</span>
          </label>

          <div className="hang-palette-block">
            <div className="hang-palette-title">Colors</div>
            <div className="hang-palette-presets">
              {LED_PALETTE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="hang-preset"
                  title={p.label}
                  onClick={() => setHangingConfig(item.id, { palette: [...p.colors] })}
                >
                  {p.colors.map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </button>
              ))}
            </div>

            <div className="hang-palette-colors">
              {cfg.palette.map((c, i) => (
                <div key={`${c}-${i}`} className="hang-palette-swatch">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => {
                      const next = [...cfg.palette];
                      next[i] = e.target.value;
                      setHangingConfig(item.id, { palette: next });
                    }}
                  />
                  <button
                    type="button"
                    className="hang-swatch-remove"
                    title="Remove color"
                    disabled={cfg.palette.length <= 1}
                    onClick={() => {
                      const next = cfg.palette.filter((_, j) => j !== i);
                      setHangingConfig(item.id, { palette: next.length ? next : ['#fff4e0'] });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {cfg.palette.length < 8 ? (
                <button
                  type="button"
                  className="hang-add-color"
                  onClick={() =>
                    setHangingConfig(item.id, {
                      palette: [...cfg.palette, '#ff6b6b'],
                    })
                  }
                >
                  ＋ Add color
                </button>
              ) : null}
            </div>
            <p className="hang-hint">
              One color = solid string. Multiple colors repeat along the path.
            </p>
          </div>
        </>
      ) : (
        <label className="hang-field">
          <span>Fullness</span>
          <input
            type="range"
            min={0.4}
            max={2}
            step={0.05}
            value={cfg.density}
            onChange={(e) => setHangingConfig(item.id, { density: Number(e.target.value) })}
          />
          <span className="hang-field-value">{cfg.density.toFixed(2)}×</span>
        </label>
      )}

      <div className="hang-panel-actions">
        <button
          type="button"
          className="hang-rail-action"
          onClick={() => {
            // Re-enter placement with same kind (new path); keep old until user finishes another.
            beginHangingDraft(cfg.kind);
            onClose();
          }}
        >
          New path
        </button>
        <button type="button" className="hang-rail-action" onClick={() => duplicateItem(item.id)}>
          Duplicate
        </button>
        <button
          type="button"
          className="hang-rail-action hang-rail-action-danger"
          onClick={() => {
            removeItem(item.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}
