import { LED_PALETTE_PRESETS } from '../lib/hangingDecorGeometry';
import { useStore } from '../store';
import { RangeControl } from './kit/RangeControl';

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
      <div className="designer-advanced-head">
        <span className="designer-advanced-eyebrow">
          {isLights ? 'String lights' : 'Hanging leaves'}
        </span>
        <button type="button" className="designer-advanced-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="designer-advanced-section">
        <RangeControl
          label="Sag"
          value={Math.round(cfg.sag * 100)}
          min={0}
          max={45}
          step={1}
          unit="%"
          onChange={(v) => setHangingConfig(item.id, { sag: v / 100 })}
        />

        {isLights ? (
          <>
            <RangeControl
              label="Bulb spacing"
              value={cfg.density}
              min={2}
              max={18}
              step={0.5}
              unit="″"
              formatValue={(v) => v.toFixed(1)}
              onChange={(v) => setHangingConfig(item.id, { density: v })}
            />
            <RangeControl
              label="Brightness"
              value={cfg.lightIntensity}
              min={0.2}
              max={3}
              step={0.1}
              formatValue={(v) => v.toFixed(1)}
              onChange={(v) => setHangingConfig(item.id, { lightIntensity: v })}
            />
            <RangeControl
              label="Light range"
              value={cfg.lightRange}
              min={16}
              max={120}
              step={4}
              unit="″"
              formatValue={(v) => String(Math.round(v))}
              onChange={(v) => setHangingConfig(item.id, { lightRange: v })}
            />

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
                      ×
                    </button>
                  </div>
                ))}
                {cfg.palette.length < 8 ? (
                  <button
                    type="button"
                    className="hang-add-color"
                    onClick={() =>
                      setHangingConfig(item.id, {
                        palette: [...cfg.palette, '#B05A3C'],
                      })
                    }
                  >
                    Add color
                  </button>
                ) : null}
              </div>
              <p className="hang-hint">
                One color = solid string. Multiple colors repeat along the path.
              </p>
            </div>
          </>
        ) : (
          <RangeControl
            label="Fullness"
            value={cfg.density}
            min={0.4}
            max={2}
            step={0.05}
            formatValue={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => setHangingConfig(item.id, { density: v })}
          />
        )}
      </div>

      <div className="hang-panel-actions">
        <button
          type="button"
          className="hang-rail-action"
          onClick={() => {
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
