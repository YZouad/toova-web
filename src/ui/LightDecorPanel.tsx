import { DEFAULT_EMITTER, useStore } from '../store';
import { RangeControl } from './kit/RangeControl';

interface Props {
  onClose: () => void;
}

export function LightDecorPanel({ onClose }: Props) {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const roomHeight = useStore((s) => s.roomGeometry.height);
  const setEmitterConfig = useStore((s) => s.setEmitterConfig);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);
  const addLightSource = useStore((s) => s.addLightSource);

  if (!item || item.kind !== 'light') return null;

  const emitter = item.emitter ?? DEFAULT_EMITTER;
  const maxElevation = Math.max(0, roomHeight - item.size[1]);
  const type = emitter.type ?? DEFAULT_EMITTER.type;

  return (
    <aside className="designer-advanced tv-scroll hang-panel" aria-label="Light source settings">
      <div className="designer-advanced-head">
        <span className="designer-advanced-eyebrow">Light source</span>
        <button type="button" className="designer-advanced-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="designer-advanced-section">
        <div className="designer-advanced-emitter-type">
          {(['point', 'spot'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={type === t ? 'active' : ''}
              onClick={() => setEmitterConfig(item.id, { type: t, enabled: true })}
            >
              {t}
            </button>
          ))}
        </div>

        <input
          type="color"
          value={emitter.color ?? DEFAULT_EMITTER.color}
          onChange={(e) => setEmitterConfig(item.id, { color: e.target.value, enabled: true })}
          aria-label="Light color"
          style={{
            width: '100%',
            height: 32,
            marginBottom: 8,
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--rule-hair)',
          }}
        />

        <RangeControl
          label="Height off floor"
          value={Math.round(item.position[1])}
          min={0}
          max={maxElevation}
          step={1}
          unit="″"
          onChange={(v) => setItemElevation(item.id, v)}
        />

        <RangeControl
          label="Brightness"
          value={emitter.intensity ?? DEFAULT_EMITTER.intensity}
          min={0.2}
          max={10}
          step={0.1}
          formatValue={(v) => v.toFixed(1)}
          onChange={(v) => setEmitterConfig(item.id, { intensity: v, enabled: true })}
        />

        <RangeControl
          label="Range"
          value={emitter.range ?? DEFAULT_EMITTER.range}
          min={24}
          max={280}
          step={4}
          unit="″"
          formatValue={(v) => v.toFixed(0)}
          onChange={(v) => setEmitterConfig(item.id, { range: v, enabled: true })}
        />

        {type === 'spot' ? (
          <RangeControl
            label="Angle"
            value={emitter.angleDeg ?? 45}
            min={15}
            max={90}
            step={5}
            unit="°"
            onChange={(v) => setEmitterConfig(item.id, { angleDeg: v, enabled: true })}
          />
        ) : null}
      </div>

      <div className="hang-panel-actions">
        <button
          type="button"
          className="hang-rail-action"
          onClick={() => {
            addLightSource();
            onClose();
          }}
        >
          Add another
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
