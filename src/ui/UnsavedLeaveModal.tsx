import { useEffect } from 'react';
import { GlassSurface } from './GlassSurface';
import { Button } from './kit/Button';
import { MonoMeta } from './kit/MonoMeta';

interface UnsavedLeaveModalProps {
  open: boolean;
  saving?: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndLeave: () => void;
}

/** Confirm leaving the designer with unsaved room changes. */
export function UnsavedLeaveModal({
  open,
  saving = false,
  onStay,
  onLeave,
  onSaveAndLeave,
}: UnsavedLeaveModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onStay();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, saving, onStay]);

  if (!open) return null;

  return (
    <div
      className="unsaved-leave-backdrop"
      role="presentation"
      onClick={() => {
        if (!saving) onStay();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <GlassSurface
          className="unsaved-leave-dialog"
          role="dialog"
          aria-label="Unsaved changes"
          style={{ maxWidth: 400, width: '100%' }}
        >
          <div className="unsaved-leave-inner">
            <MonoMeta size="xs" tone="dense" upper className="unsaved-leave-eyebrow">
              Unsaved changes
            </MonoMeta>
            <h2 className="unsaved-leave-title">Leave without saving?</h2>
            <p className="unsaved-leave-hint">
              This room has edits that have not been saved. Leave and discard them, or save before you go.
            </p>
            <div className="unsaved-leave-actions">
              <Button size="sm" disabled={saving} onClick={onSaveAndLeave}>
                {saving ? 'Saving…' : 'Save and leave'}
              </Button>
              <button
                type="button"
                className="unsaved-leave-discard"
                disabled={saving}
                onClick={onLeave}
              >
                Leave without saving
              </button>
              <button
                type="button"
                className="unsaved-leave-stay"
                disabled={saving}
                onClick={onStay}
              >
                Stay
              </button>
            </div>
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}
