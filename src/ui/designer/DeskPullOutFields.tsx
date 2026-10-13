import {
  maxPullOutWidthIn,
  normalizeDeskSidePedestal,
  resolvePullOutDims,
  type FurnitureBuild,
} from '../../lib/furnitureBuild';

function Stepper({
  label,
  value,
  min,
  max,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
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
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
}

export function DeskPullOutFields({
  build,
  deskW,
  deskD,
  deskH,
  onPatch,
}: {
  build: FurnitureBuild;
  deskW: number;
  deskD: number;
  deskH: number;
  onPatch: (p: FurnitureBuild) => void;
}) {
  const side = normalizeDeskSidePedestal(build.deskPedestal);
  const dims = resolvePullOutDims(deskW, deskD, deskH, side, build);
  const maxW = maxPullOutWidthIn(deskW, side);
  const maxD = Math.max(4, deskD - 1.5);

  return (
    <>
      <Stepper
        label="Drawer width (in)"
        value={dims.widthIn}
        min={6}
        max={maxW}
        onChange={(pullOutWidthIn) => onPatch({ pullOutWidthIn })}
      />
      <Stepper
        label="Drawer depth (in)"
        value={dims.depthIn}
        min={3}
        max={maxD}
        onChange={(pullOutDepthIn) => onPatch({ pullOutDepthIn })}
      />
      <Stepper
        label="Drawer height (in)"
        value={dims.heightIn}
        min={2.5}
        max={8}
        step={0.25}
        onChange={(pullOutHeightIn) => onPatch({ pullOutHeightIn })}
      />
    </>
  );
}
