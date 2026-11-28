import type { FloorPlanTool } from './FloorPlanEditor';

interface FloorPlanToolRailProps {
  tool: FloorPlanTool;
  onToolChange: (tool: FloorPlanTool) => void;
  angleSnap: boolean;
  onAngleSnapChange: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onClear: () => void;
  /** Reference image underlay controls (import flow). */
  hasUnderlay?: boolean;
  underlayVisible?: boolean;
  onUnderlayVisibleChange?: (v: boolean) => void;
  underlayOpacity?: number;
  onUnderlayOpacityChange?: (v: number) => void;
}

const TOOLS: { id: FloorPlanTool; label: string; shortcut: string }[] = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'wall', label: 'Wall', shortcut: 'W' },
  { id: 'door', label: 'Door', shortcut: 'D' },
  { id: 'window', label: 'Window', shortcut: 'N' },
  { id: 'scale', label: 'Set scale', shortcut: 'S' },
  { id: 'pan', label: 'Pan', shortcut: 'H' },
];

function RailAction({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`fp-rail-action${danger ? ' fp-rail-action-danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}

export function FloorPlanToolRail({
  tool,
  onToolChange,
  angleSnap,
  onAngleSnapChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitView,
  onClear,
  hasUnderlay = false,
  underlayVisible = true,
  onUnderlayVisibleChange,
  underlayOpacity = 0.45,
  onUnderlayOpacityChange,
}: FloorPlanToolRailProps) {
  return (
    <aside className="fp-rail" aria-label="Floor plan tools">
      <div className="fp-rail-section">
        <span className="fp-rail-label">Tools</span>
        <div className="fp-rail-tools">
          {TOOLS.map((t) => {
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`fp-rail-tool${active ? ' active' : ''}`}
                title={`${t.label} (${t.shortcut})`}
                onClick={() => onToolChange(t.id)}
              >
                <span className="fp-rail-tool-label">{t.label}</span>
                <span className="fp-rail-tool-key">{t.shortcut}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fp-rail-section">
        <span className="fp-rail-label">Edit</span>
        <RailAction label="Undo" disabled={!canUndo} onClick={onUndo} />
        <RailAction label="Redo" disabled={!canRedo} onClick={onRedo} />
        <label className="fp-rail-toggle">
          <input type="checkbox" checked={angleSnap} onChange={(e) => onAngleSnapChange(e.target.checked)} />
          <span className="fp-rail-toggle-box" aria-hidden />
          45° snap
        </label>
      </div>

      <div className="fp-rail-section">
        <span className="fp-rail-label">View</span>
        <RailAction label="Fit to plan" onClick={onFitView} />
        {hasUnderlay ? (
          <>
            <label className="fp-rail-toggle">
              <input
                type="checkbox"
                checked={underlayVisible}
                onChange={(e) => onUnderlayVisibleChange?.(e.target.checked)}
              />
              <span className="fp-rail-toggle-box" aria-hidden />
              Show image
            </label>
            {underlayVisible ? (
              <label className="fp-rail-opacity">
                <span className="fp-rail-opacity-label">Image opacity</span>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={underlayOpacity}
                  onChange={(e) => onUnderlayOpacityChange?.(Number(e.target.value))}
                />
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="fp-rail-section fp-rail-section-bottom">
        <RailAction label="Clear plan" danger onClick={onClear} />
      </div>
    </aside>
  );
}
