import type { DesignerTool } from '../store';
import { useStore } from '../store';
import { GlassSurface } from './GlassSurface';

const TOOLS: {
  id: DesignerTool;
  label: string;
  hint: string;
}[] = [
  { id: 'select', label: 'Select', hint: 'Move furniture' },
  { id: 'hanging-leaves', label: 'Leaves', hint: 'Hang leafy garlands' },
  { id: 'hanging-lights', label: 'Lights', hint: 'Hang LED strings' },
];

export function HangingDecorToolRail() {
  const tool = useStore((s) => s.designerTool);
  const draft = useStore((s) => s.hangingDraft);
  const setDesignerTool = useStore((s) => s.setDesignerTool);
  const finishHangingDraft = useStore((s) => s.finishHangingDraft);
  const cancelHangingDraft = useStore((s) => s.cancelHangingDraft);
  const popHangingAnchor = useStore((s) => s.popHangingAnchor);

  const placing = tool === 'hanging-leaves' || tool === 'hanging-lights';
  const canFinish = (draft?.anchors.length ?? 0) >= 2;

  return (
    <GlassSurface
      compact
      as="aside"
      className="hang-rail"
      aria-label="Hanging decoration tools"
    >
      <div className="hang-rail-section">
        <span className="hang-rail-label">Decor</span>
        <div className="hang-rail-tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`hang-rail-tool${tool === t.id ? ' active' : ''}`}
              title={t.hint}
              aria-pressed={tool === t.id}
              onClick={() => setDesignerTool(t.id)}
            >
              <span className="hang-rail-tool-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {placing ? (
        <div className="hang-rail-section hang-rail-help">
          <p>
            Click to place anchors{draft ? ` (${draft.anchors.length})` : ''}. Drag to look
            around.
          </p>
          <p className="hang-rail-help-keys">
            Enter / double-click finish · Backspace undo · Esc cancel
          </p>
          <div className="hang-rail-actions">
            <button
              type="button"
              className="hang-rail-action"
              disabled={!draft || draft.anchors.length === 0}
              onClick={() => popHangingAnchor()}
            >
              Undo point
            </button>
            <button
              type="button"
              className="hang-rail-action hang-rail-action-primary"
              disabled={!canFinish}
              onClick={() => finishHangingDraft()}
            >
              Finish
            </button>
            <button
              type="button"
              className="hang-rail-action hang-rail-action-danger"
              onClick={() => cancelHangingDraft()}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </GlassSurface>
  );
}
