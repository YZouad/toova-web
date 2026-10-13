import type { DrawerArrangement, FurnitureBuild } from '../../lib/furnitureBuild';

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="dg-dim-field">
      <span className="dg-dim-field__label">{label}</span>
      <input
        className="dg-dim-field__input"
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, Math.floor(n))));
        }}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="dg-dim-field">
      <span className="dg-dim-field__label">{label}</span>
      <select
        className="dg-dim-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DrawerStructureFields({
  build,
  drawerMax,
  columnMax,
  drawerLabel = 'Drawers',
  onPatch,
}: {
  build: FurnitureBuild;
  drawerMax: number;
  columnMax: number;
  drawerLabel?: string;
  onPatch: (p: FurnitureBuild) => void;
}) {
  const arrangement: DrawerArrangement =
    build.drawerArrangement ?? (build.columns && build.columns > 1 ? 'grid' : 'stack');

  return (
    <>
      <Stepper
        label={drawerLabel}
        value={build.drawers ?? 3}
        min={1}
        max={drawerMax}
        onChange={(drawers) => onPatch({ drawers })}
      />
      <SelectField<DrawerArrangement>
        label="Drawer direction"
        value={arrangement}
        options={[
          { value: 'stack', label: 'Stacked (tall)' },
          { value: 'wide', label: 'Side by side (wide row)' },
          { value: 'grid', label: 'Grid (rows × wide)' },
        ]}
        onChange={(drawerArrangement) => onPatch({ drawerArrangement })}
      />
      {arrangement === 'grid' ? (
        <Stepper
          label="Wide count"
          value={build.columns ?? 2}
          min={2}
          max={Math.min(columnMax, build.drawers ?? drawerMax)}
          onChange={(columns) => onPatch({ columns, drawerArrangement: 'grid' })}
        />
      ) : null}
    </>
  );
}
