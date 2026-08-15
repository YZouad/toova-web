import { useEffect, useRef, useState } from 'react';
import type { DesignerTool } from '../store';
import { useStore } from '../store';
import { GlassSurface } from './GlassSurface';

const PHONE_MQ = '(max-width: 768px)';

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
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches,
  );
  const [expanded, setExpanded] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches),
  );
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(PHONE_MQ);
    const sync = () => {
      const phone = mq.matches;
      setIsPhone(phone);
      if (!phone) setExpanded(true);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (placing) setExpanded(true);
  }, [placing]);

  useEffect(() => {
    if (!isPhone || !expanded || placing) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded, placing, isPhone]);

  const activeLabel =
    TOOLS.find((t) => t.id === tool)?.label ?? 'Decor';
  const showExpanded = !isPhone || expanded;

  return (
    <GlassSurface
      compact
      as="aside"
      className={['hang-rail', showExpanded ? 'hang-rail--expanded' : ''].filter(Boolean).join(' ')}
      aria-label="Hanging decoration tools"
    >
      <div ref={rootRef as never} className="hang-rail-inner">
        <button
          type="button"
          className="hang-rail-chip"
          aria-expanded={showExpanded}
          aria-controls="hang-rail-panel"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="hang-rail-chip-label">Decor</span>
          <span className="hang-rail-chip-value">{activeLabel}</span>
          <span className="hang-rail-chip-chevron" aria-hidden>
            {showExpanded ? '▾' : '▸'}
          </span>
        </button>

        <div id="hang-rail-panel" className="hang-rail-panel">
          <div className="hang-rail-section">
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
        </div>
      </div>
    </GlassSurface>
  );
}
