import type { FurnitureKind } from '../../furniture/registry';
import {
  buildForRender,
  kindSupportsBuild,
  normalizeDeskPullOut,
  normalizeDeskSidePedestal,
} from '../../lib/furnitureBuild';
import type {
  ChairBack,
  ChairStyle,
  DeskBase,
  DeskPedestalSide,
  DeskPullOut,
  FurnitureBuild,
} from '../../lib/furnitureBuild';
import { useStore, type Item } from '../../store';
import { CabinetDrawerGridFields } from './CabinetDrawerGridFields';
import { DeskPullOutFields } from './DeskPullOutFields';
import { PanelSection } from './PanelShell';

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

export function FurnitureBuildEditor({ item }: { item: Item }) {
  const setItemBuild = useStore((s) => s.setItemBuild);
  if (!kindSupportsBuild(item.kind)) return null;

  const kind = item.kind as Extract<
    FurnitureKind,
    'dresser' | 'nightstand' | 'desk' | 'bookshelf' | 'shelf' | 'chair'
  >;
  const build = buildForRender(kind, item.build);
  const deskSide =
    kind === 'desk' ? normalizeDeskSidePedestal(build.deskPedestal) : 'none';
  const deskPullOut =
    kind === 'desk'
      ? normalizeDeskPullOut(build.deskPullOut, build.deskPedestal)
      : 'none';
  const [deskW, deskH, deskD] = item.size;

  const patch = (p: FurnitureBuild) => setItemBuild(item.id, p);

  return (
    <PanelSection title="Structure">
      <div className="dg-dim-grid">
        {kind === 'dresser' ? (
          <CabinetDrawerGridFields build={build} maxRows={8} maxCols={4} onPatch={patch} />
        ) : null}
        {kind === 'nightstand' ? (
          <CabinetDrawerGridFields build={build} maxRows={4} maxCols={2} onPatch={patch} />
        ) : null}
        {kind === 'desk' ? (
          <>
            {deskSide !== 'both' ? (
              <>
                <SelectField<DeskBase>
                  label="Side support"
                  value={build.deskBase ?? 'legs'}
                  options={[
                    { value: 'legs', label: 'Legs' },
                    { value: 'panels', label: 'Filled sides' },
                  ]}
                  onChange={(deskBase) => patch({ deskBase })}
                />
                <label className="dg-dim-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="dg-dim-field__label">Back panel</span>
                  <input
                    type="checkbox"
                    checked={build.deskBackPanel === true}
                    onChange={(e) => patch({ deskBackPanel: e.target.checked ? true : undefined })}
                  />
                </label>
              </>
            ) : null}
            <SelectField<DeskPedestalSide>
              label="Side cabinets"
              value={deskSide}
              options={[
                { value: 'none', label: 'None' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'both', label: 'Both (executive)' },
              ]}
              onChange={(deskPedestal) => {
                if (deskPedestal === 'none') {
                  patch({
                    deskPedestal: undefined,
                    drawers: undefined,
                    drawerRows: undefined,
                    drawerColumns: undefined,
                    columns: undefined,
                  });
                  return;
                }
                patch({ deskPedestal });
              }}
            />
            {deskSide !== 'none' ? (
              <>
                <CabinetDrawerGridFields build={build} maxRows={4} maxCols={2} onPatch={patch} />
                {deskSide === 'both' ? (
                  <p className="dg-row__meta" style={{ gridColumn: '1 / -1', margin: 0 }}>
                    Total split evenly between left and right pedestals.
                  </p>
                ) : null}
              </>
            ) : null}
            <SelectField<DeskPullOut>
              label="Under-drawer"
              value={deskPullOut}
              options={[
                { value: 'none', label: 'None' },
                { value: 'front', label: 'Front (full width)' },
                { value: 'center', label: 'Center (depth)' },
              ]}
              onChange={(next) => {
                if (next === 'none') {
                  patch({
                    deskPullOut: undefined,
                    pullOutWidthIn: undefined,
                    pullOutDepthIn: undefined,
                    pullOutHeightIn: undefined,
                  });
                  return;
                }
                patch({ deskPullOut: next, deskPedestal: deskSide === 'none' ? undefined : deskSide });
              }}
            />
            {deskPullOut !== 'none' ? (
              <>
                <DeskPullOutFields
                  build={build}
                  deskW={deskW}
                  deskD={deskD}
                  deskH={deskH}
                  onPatch={patch}
                />
                <p className="dg-row__meta" style={{ gridColumn: '1 / -1', margin: 0 }}>
                  Works together with side cabinets. Width is limited by the open knee well.
                </p>
              </>
            ) : null}
          </>
        ) : null}
        {kind === 'bookshelf' ? (
          <>
            <Stepper
              label="Shelves"
              value={build.shelves ?? 3}
              min={1}
              max={8}
              onChange={(shelves) => patch({ shelves })}
            />
            <Stepper
              label="Columns"
              value={build.bookshelfColumns ?? 1}
              min={1}
              max={4}
              onChange={(bookshelfColumns) => patch({ bookshelfColumns })}
            />
            <label className="dg-dim-field" style={{ gridColumn: '1 / -1' }}>
              <span className="dg-dim-field__label">Back panel</span>
              <input
                type="checkbox"
                checked={build.back !== false}
                onChange={(e) => patch({ back: e.target.checked })}
              />
            </label>
          </>
        ) : null}
        {kind === 'shelf' ? (
          <>
            <Stepper
              label="Boards"
              value={build.boards ?? 1}
              min={1}
              max={5}
              onChange={(boards) => patch({ boards })}
            />
            <Stepper
              label="Gap (in)"
              value={build.gap ?? 8}
              min={2}
              max={24}
              onChange={(gap) => patch({ gap })}
            />
          </>
        ) : null}
        {kind === 'chair' ? (
          <>
            <SelectField<ChairStyle>
              label="Style"
              value={build.style ?? 'side'}
              options={[
                { value: 'side', label: 'Side chair' },
                { value: 'armchair', label: 'Armchair' },
                { value: 'stool', label: 'Stool' },
              ]}
              onChange={(style) => patch({ style })}
            />
            {build.style !== 'stool' ? (
              <SelectField<ChairBack>
                label="Back"
                value={build.backStyle ?? 'solid'}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'slats', label: 'Slats' },
                ]}
                onChange={(backStyle) => patch({ backStyle })}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </PanelSection>
  );
}
