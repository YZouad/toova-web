import { motion } from 'motion/react';
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
}

const TOOLS: { id: FloorPlanTool; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M4 3l12 7-5 .5 2.5 6.5-2 1L6.5 11.5 4 13V3z" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'wall',
    label: 'Wall',
    shortcut: 'W',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <line x1="3" y1="16" x2="17" y2="4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'door',
    label: 'Door',
    shortcut: 'D',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M4 16V6a2 2 0 012-2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 4v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 16a4 4 0 004-4V8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'window',
    label: 'Window',
    shortcut: 'N',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <rect x="3" y="6" width="14" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="10" y1="6" x2="10" y2="14" stroke="currentColor" strokeWidth="1.5" />
        <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'pan',
    label: 'Pan',
    shortcut: 'H',
    icon: (
      <svg viewBox="0 0 20 20" aria-hidden>
        <path d="M10 3c-1.5 2-4 3.5-4 6.5a4 4 0 108 0c0-3-2.5-4.5-4-6.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function RailAction({
  label,
  onClick,
  disabled,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`fp-rail-action${danger ? ' fp-rail-action-danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <span className="fp-rail-action-icon">{icon}</span> : null}
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
                {active ? (
                  <motion.span
                    layoutId="fp-tool-active"
                    className="fp-rail-tool-highlight"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="fp-rail-tool-icon">{t.icon}</span>
                <span className="fp-rail-tool-label">{t.label}</span>
                <span className="fp-rail-tool-key">{t.shortcut}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fp-rail-section">
        <span className="fp-rail-label">Edit</span>
        <RailAction
          label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          icon={
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M3 8h8a3 3 0 100-6H8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M6 5L3 8l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <RailAction
          label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
          icon={
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M13 8H5a3 3 0 110-6h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 5l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <label className="fp-rail-toggle">
          <input type="checkbox" checked={angleSnap} onChange={(e) => onAngleSnapChange(e.target.checked)} />
          <span className="fp-rail-toggle-box" aria-hidden />
          45° snap
        </label>
      </div>

      <div className="fp-rail-section">
        <span className="fp-rail-label">View</span>
        <RailAction
          label="Fit to plan"
          onClick={onFitView}
          icon={
            <svg viewBox="0 0 16 16" aria-hidden>
              <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          }
        />
      </div>

      <div className="fp-rail-section fp-rail-section-bottom">
        <RailAction
          label="Clear plan"
          danger
          onClick={onClear}
          icon={
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>
    </aside>
  );
}
