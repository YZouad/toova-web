import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { WINDOW } from '../units';
import {
  type FloorPlan,
  type FloorPlanOpening,
  type LengthUnit,
  formatLength,
  lShapePlan,
  planBounds,
  rectanglePlan,
  setWallLength,
  updateOpening,
  clampPlanHeight,
  validateFloorPlan,
  wallById,
  wallLength,
} from '../lib/floorPlanGeometry';
import { FpSpotlightCard } from './FpSpotlightCard';

export type GridSnapSize = 3 | 6 | 12;

interface FloorPlanInspectorProps {
  plan: FloorPlan;
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  lengthUnit: LengthUnit;
  gridSnap: GridSnapSize;
  presetWidthFt: number;
  presetWidthIn: number;
  presetDepthFt: number;
  presetDepthIn: number;
  onLengthUnitChange: (unit: LengthUnit) => void;
  onGridSnapChange: (grid: GridSnapSize) => void;
  onPresetWidthFtChange: (v: number) => void;
  onPresetWidthInChange: (v: number) => void;
  onPresetDepthFtChange: (v: number) => void;
  onPresetDepthInChange: (v: number) => void;
  onPlanChange: (plan: FloorPlan) => void;
  onSelectWall: (id: string | null) => void;
  onSelectOpening: (id: string | null) => void;
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const ITEM = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 28 } },
};

function buildChecklist(plan: FloorPlan, issues: ReturnType<typeof validateFloorPlan>): ChecklistItem[] {
  const codes = new Set(issues.map((i) => i.code));
  const doors = plan.openings.filter((o) => o.kind === 'door').length;
  return [
    {
      id: 'boundary',
      label: 'Close the outer boundary',
      done: !codes.has('open_ends') && !codes.has('no_envelope'),
    },
    {
      id: 'no_cross',
      label: 'Walls must not cross',
      done: !codes.has('self_intersect'),
    },
    {
      id: 'size',
      label: 'Room footprint large enough',
      done: !codes.has('too_small') && !codes.has('short_wall'),
    },
    {
      id: 'door',
      label: 'Add at least one door',
      done: doors >= 1 && !codes.has('no_door'),
    },
    {
      id: 'openings',
      label: 'Openings fit on walls',
      done: !codes.has('opening_bounds') && !codes.has('opening_overlap') && !codes.has('orphan_opening'),
    },
  ];
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <h3 className="fp-inspector-eyebrow">{children}</h3>;
}

function NumField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="fp-field">
      <label className="fp-field-label">{label}</label>
      <input
        type="number"
        className="fp-field-input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </div>
  );
}

function OpeningFields({
  opening,
  plan,
  lengthUnit,
  onChange,
}: {
  opening: FloorPlanOpening;
  plan: FloorPlan;
  lengthUnit: LengthUnit;
  onChange: (plan: FloorPlan) => void;
}) {
  const patch = (p: Partial<Pick<FloorPlanOpening, 'offset' | 'width' | 'height' | 'sill' | 'hinge'>>) => {
    onChange(updateOpening(plan, opening.id, p));
  };

  return (
    <>
      <SectionEyebrow>{opening.kind === 'door' ? 'Door' : 'Window'}</SectionEyebrow>
      <p className="fp-inspector-serif">{opening.kind === 'door' ? 'Entry opening' : 'Wall opening'}</p>
      <NumField
        label={`Width (${lengthUnit === 'inches' ? 'in' : 'ft/in'})`}
        value={opening.width}
        min={6}
        step={6}
        onChange={(v) => patch({ width: v })}
      />
      <NumField
        label="Height (in)"
        value={opening.height}
        min={12}
        step={1}
        onChange={(v) => patch({ height: v })}
      />
      <NumField
        label="Offset along wall (in)"
        value={opening.offset}
        min={6}
        step={6}
        onChange={(v) => patch({ offset: v })}
      />
      {opening.kind === 'window' ? (
        <NumField label="Sill height (in)" value={opening.sill ?? WINDOW.sill} min={0} step={1} onChange={(v) => patch({ sill: v })} />
      ) : (
        <div className="fp-field">
          <label className="fp-field-label">Hinge</label>
          <div className="fp-field-row">
            {(['left', 'right'] as const).map((h) => (
              <button
                key={h}
                type="button"
                className={`fp-chip${opening.hinge === h ? ' active' : ''}`}
                onClick={() => patch({ hinge: h })}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="fp-inspector-hint">
        {formatLength(opening.width, lengthUnit)} wide · {formatLength(opening.height, lengthUnit)} tall
      </p>
    </>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <motion.li
      variants={ITEM}
      className={item.done ? 'fp-checklist-done' : 'fp-checklist-todo'}
      layout
    >
      <span className="fp-checklist-icon-wrap" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          {item.done ? (
            <motion.span
              key="done"
              className="fp-checklist-icon fp-checklist-icon-done"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            >
              ✓
            </motion.span>
          ) : (
            <motion.span
              key="todo"
              className="fp-checklist-icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              ○
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {item.label}
    </motion.li>
  );
}

export function FloorPlanInspector({
  plan,
  selectedWallId,
  selectedOpeningId,
  lengthUnit,
  gridSnap,
  presetWidthFt,
  presetWidthIn,
  presetDepthFt,
  presetDepthIn,
  onLengthUnitChange,
  onGridSnapChange,
  onPresetWidthFtChange,
  onPresetWidthInChange,
  onPresetDepthFtChange,
  onPresetDepthInChange,
  onPlanChange,
  onSelectWall,
  onSelectOpening,
}: FloorPlanInspectorProps) {
  const issues = useMemo(() => validateFloorPlan(plan), [plan]);
  const checklist = useMemo(() => buildChecklist(plan, issues), [plan, issues]);
  const bounds = useMemo(() => planBounds(plan), [plan]);

  const selectedOpening = selectedOpeningId
    ? plan.openings.find((o) => o.id === selectedOpeningId) ?? null
    : null;
  const selectedWall = selectedWallId ? wallById(plan, selectedWallId) ?? null : null;

  const presetWidth = presetWidthFt * 12 + presetWidthIn;
  const presetDepth = presetDepthFt * 12 + presetDepthIn;

  const applyRectangle = () => {
    onSelectWall(null);
    onSelectOpening(null);
    onPlanChange(rectanglePlan(presetWidth, presetDepth, plan.height));
  };

  const applySquare = () => {
    const side = Math.max(presetWidth, presetDepth);
    onSelectWall(null);
    onSelectOpening(null);
    onPlanChange(rectanglePlan(side, side, plan.height));
  };

  const applyLShape = () => {
    onSelectWall(null);
    onSelectOpening(null);
    onPlanChange(lShapePlan(presetWidth, presetDepth, presetWidth / 3, presetDepth / 3, plan.height));
  };

  const tips = [
    'Click twice with Wall tool to draw a segment.',
    'Windows: click start, then end along a wall.',
    'Select a wall or opening and press Delete to remove.',
    'Scroll to zoom · Pan tool or middle-drag to move.',
    `1 square = ${gridSnap}″ · bold lines = 1 ft`,
  ];

  return (
    <aside className="fp-inspector tv-scroll" aria-label="Floor plan inspector">
      <FpSpotlightCard className="fp-card-context">
        {selectedOpening ? (
          <OpeningFields opening={selectedOpening} plan={plan} lengthUnit={lengthUnit} onChange={onPlanChange} />
        ) : selectedWall ? (
          <>
            <SectionEyebrow>Wall</SectionEyebrow>
            <p className="fp-inspector-serif">{formatLength(wallLength(plan, selectedWall), lengthUnit)}</p>
            <NumField
              label={`Length (${lengthUnit === 'inches' ? 'in' : 'ft/in'})`}
              value={Math.round(wallLength(plan, selectedWall))}
              min={6}
              step={6}
              onChange={(v) => onPlanChange(setWallLength(plan, selectedWall.id, v))}
            />
            <p className="fp-inspector-hint">Drag corners on canvas to reshape</p>
          </>
        ) : (
          <>
            <SectionEyebrow>Room</SectionEyebrow>
            <p className="fp-inspector-serif">
              {formatLength(bounds.width, lengthUnit)} × {formatLength(bounds.depth, lengthUnit)}
            </p>
            <div className="fp-field-row fp-field-row-dims">
              <NumField label="Width ft" value={presetWidthFt} min={0} onChange={onPresetWidthFtChange} />
              <NumField label="in" value={presetWidthIn} min={0} max={11} onChange={onPresetWidthInChange} />
            </div>
            <div className="fp-field-row fp-field-row-dims">
              <NumField label="Depth ft" value={presetDepthFt} min={0} onChange={onPresetDepthFtChange} />
              <NumField label="in" value={presetDepthIn} min={0} max={11} onChange={onPresetDepthInChange} />
            </div>
            <div className="fp-field-row fp-field-row-presets">
              <button type="button" className="fp-chip fp-chip-preset" onClick={applyRectangle}>
                <span className="fp-chip-glyph" aria-hidden>▭</span>
                Rectangle
              </button>
              <button type="button" className="fp-chip fp-chip-preset" onClick={applySquare}>
                <span className="fp-chip-glyph" aria-hidden>□</span>
                Square
              </button>
              <button type="button" className="fp-chip fp-chip-preset" onClick={applyLShape}>
                <span className="fp-chip-glyph" aria-hidden>⌐</span>
                L-shape
              </button>
            </div>
          </>
        )}
      </FpSpotlightCard>

      <FpSpotlightCard>
        <SectionEyebrow>Settings</SectionEyebrow>
        <NumField
          label="Ceiling height (in)"
          value={plan.height}
          min={72}
          max={144}
          step={1}
          onChange={(v) => onPlanChange({ ...plan, height: clampPlanHeight(v) })}
        />
        <div className="fp-field">
          <label className="fp-field-label">Grid snap</label>
          <div className="fp-field-row">
            {([3, 6, 12] as GridSnapSize[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`fp-chip${gridSnap === g ? ' active' : ''}`}
                onClick={() => onGridSnapChange(g)}
              >
                {g}″
              </button>
            ))}
          </div>
        </div>
        <div className="fp-field">
          <label className="fp-field-label">Units</label>
          <div className="fp-field-row">
            <button
              type="button"
              className={`fp-chip${lengthUnit === 'inches' ? ' active' : ''}`}
              onClick={() => onLengthUnitChange('inches')}
            >
              Inches
            </button>
            <button
              type="button"
              className={`fp-chip${lengthUnit === 'ft-in' ? ' active' : ''}`}
              onClick={() => onLengthUnitChange('ft-in')}
            >
              Ft + in
            </button>
          </div>
        </div>
      </FpSpotlightCard>

      <FpSpotlightCard>
        <SectionEyebrow>Checklist</SectionEyebrow>
        <motion.ul className="fp-checklist" variants={STAGGER} initial="hidden" animate="show">
          {checklist.map((item) => (
            <ChecklistRow key={item.id} item={item} />
          ))}
        </motion.ul>
        <p className="fp-inspector-meta">
          {plan.walls.length} walls · {plan.openings.filter((o) => o.kind === 'door').length} doors ·{' '}
          {plan.openings.filter((o) => o.kind === 'window').length} windows
        </p>
      </FpSpotlightCard>

      {!selectedOpening && !selectedWall ? (
        <FpSpotlightCard>
          <SectionEyebrow>Tips</SectionEyebrow>
          <motion.ul className="fp-tips" variants={STAGGER} initial="hidden" animate="show">
            {tips.map((tip) => (
              <motion.li key={tip} variants={ITEM}>
                {tip}
              </motion.li>
            ))}
          </motion.ul>
        </FpSpotlightCard>
      ) : null}
    </aside>
  );
}
