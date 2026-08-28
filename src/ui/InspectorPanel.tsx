import { lampArmMaxForRoom, lampPartsFromSize, lampSizeFromArmHeight, LAMP_ARM_MIN } from '../furniture/lampGeometry';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';
import { planBounds } from '../lib/roomGeometry';
import { useStore } from '../store';
import { Button } from './kit/Button';
import { Checkbox } from './kit/Checkbox';
import { MonoMeta } from './kit/MonoMeta';
import { NumberStepper } from './kit/NumberStepper';
import { RangeControl } from './kit/RangeControl';
import { Rule } from './kit/Rule';

export function InspectorPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const roomGeometry = useStore((s) => s.roomGeometry);
  const updateRotation = useStore((s) => s.updateRotation);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const setWallMounted = useStore((s) => s.setWallMounted);
  const setBedHeight = useStore((s) => s.setBedHeight);
  const removeItem = useStore((s) => s.removeItem);

  if (!item) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="empty-hint">
          Click an item to select it.<br />
          Drag to move · R rotates · Delete removes.
        </p>
      </aside>
    );
  }

  const rotDeg = Math.round(((item.rotationY * 180) / Math.PI) % 360);
  const canEditSize = item.kind !== 'imported' || !!item.importedNaturalSize;
  const maxItemFootprint = Math.max(planBounds(roomGeometry).width, planBounds(roomGeometry).depth, 200);
  const maxElevation = Math.max(0, roomGeometry.height - item.size[1]);
  const currentY = Math.round(item.position[1]);
  const sizeLabels = (item.kind === 'shelf'
    ? (['Width', 'Thickness', 'Depth'] as const)
    : (['Width', 'Height', 'Depth'] as const));
  const maxSide = Math.max(item.size[0], item.size[1], item.size[2]);
  const lampParts = item.kind === 'lamp' ? lampPartsFromSize(item.size) : null;
  const lampArmMax = lampParts ? lampArmMaxForRoom(item.size, roomGeometry.height) : LAMP_ARM_MIN;

  return (
    <aside className="inspector">
      <h2>{item.label}</h2>
      <MonoMeta size="sm" tone="dense" style={{ display: 'block', marginBottom: 16 }}>
        {item.kind} · {item.size.map((n) => Math.round(n)).join(' × ')} in
      </MonoMeta>

      {canEditSize ? (
        <div className="inspector-section">
          <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', marginBottom: 12 }}>
            Size (in)
          </MonoMeta>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sizeLabels.map((label, i) => (
              <NumberStepper
                key={label}
                label={label.slice(0, 1)}
                value={Math.round(item.size[i] * 10) / 10}
                step={0.5}
                min={1}
                onChange={(v) => {
                  const next: [number, number, number] = [...item.size] as [number, number, number];
                  next[i] = v;
                  setItemSize(item.id, next);
                }}
              />
            ))}
          </div>
          <Rule weight="hair" spacing={16} />
          <RangeControl
            label="Uniform"
            value={Math.round(maxSide * 10) / 10}
            min={4}
            max={maxItemFootprint}
            step={0.5}
            unit="in"
            onChange={(v) => setItemSize(item.id, proportionalSizesFromMaxSide(item.size, v))}
          />
          <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginTop: 8 }}>
            Largest side scales all dimensions together.
          </MonoMeta>
        </div>
      ) : (
        <div className="row">
          <label>Size</label>
          <MonoMeta size="sm" tone="dense">Measuring model…</MonoMeta>
        </div>
      )}

      <Rule weight="hair" spacing={16} />

      <RangeControl
        label="Rotation"
        value={rotDeg}
        min={0}
        max={359}
        step={15}
        unit="°"
        onChange={(v) => updateRotation(item.id, (v * Math.PI) / 180)}
      />

      {item.kind === 'bed' && (
        <RangeControl
          label="Leg height"
          value={item.bedLegHeight ?? 8}
          min={4}
          max={36}
          step={1}
          unit="in"
          onChange={(v) => setBedHeight(item.id, v)}
        />
      )}

      {item.kind === 'lamp' && lampParts && (
        <RangeControl
          label="Lamp neck height"
          value={Math.round(lampParts.stemH)}
          min={LAMP_ARM_MIN}
          max={lampArmMax}
          step={1}
          unit="in"
          onChange={(v) => setItemSize(item.id, lampSizeFromArmHeight(item.size, v))}
        />
      )}

      {item.kind === 'bed' && (
        <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginBottom: 12 }}>
          Use the Bedding panel in the designer to customize sheets, comforter, and pillows.
        </MonoMeta>
      )}

      {item.kind !== 'bed' && (
        <RangeControl
          label="Height"
          value={currentY}
          min={0}
          max={maxElevation}
          step={1}
          unit="in"
          onChange={(v) => setItemElevation(item.id, v)}
        />
      )}

      <Checkbox
        checked={!!item.wallMounted}
        label="Wall mount"
        onChange={(checked) => setWallMounted(item.id, checked)}
      />

      <div className="row">
        <label>Position</label>
        <MonoMeta size="sm" tone="dense">
          {Math.round(item.position[0])}″ · {Math.round(item.position[2])}″
        </MonoMeta>
      </div>

      <Button size="sm" variant="outline" full onClick={() => removeItem(item.id)} style={{ marginTop: 20, color: 'var(--danger)', borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}>
        Remove from room
      </Button>
    </aside>
  );
}
