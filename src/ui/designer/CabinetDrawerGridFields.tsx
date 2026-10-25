import type { FurnitureBuild } from '../../lib/furnitureBuild';

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

/** Bookshelf-style rows × columns; total drawers always fills the grid. */
export function CabinetDrawerGridFields({
  build,
  maxRows,
  maxCols,
  onPatch,
}: {
  build: FurnitureBuild;
  maxRows: number;
  maxCols: number;
  onPatch: (p: FurnitureBuild) => void;
}) {
  const rows = build.drawerRows ?? build.drawers ?? 3;
  const cols = build.drawerColumns ?? build.columns ?? 1;
  const total = rows * cols;

  return (
    <>
      <Stepper
        label="Rows"
        value={rows}
        min={1}
        max={maxRows}
        onChange={(drawerRows) => onPatch({ drawerRows })}
      />
      <Stepper
        label="Columns"
        value={cols}
        min={1}
        max={maxCols}
        onChange={(drawerColumns) => onPatch({ drawerColumns })}
      />
      <p className="dg-row__meta" style={{ gridColumn: '1 / -1', margin: 0 }}>
        {total} drawer{total === 1 ? '' : 's'} ({rows}×{cols})
      </p>
    </>
  );
}
