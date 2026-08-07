import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './kit';

interface ChecklistModalProps {
  open: boolean;
  onClose: () => void;
  onViewChecklist: () => void;
}

/** Compact promo teaser — full list lives on the checklist page. */
export function ChecklistModal({ open, onClose, onViewChecklist }: ChecklistModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="checklist-modal-backdrop checklist-modal-backdrop--teaser"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="checklist-modal checklist-modal--teaser"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="checklist-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <p className="checklist-modal-eyebrow">Move-in ready</p>
        <h2 id={titleId} className="checklist-modal-title">
          Get the Toova checklist
        </h2>
        <p className="checklist-modal-hint">
          A dorm essentials list you can check off as you shop — then design your room so you know what fits.
        </p>
        <div className="checklist-modal-footer checklist-modal-footer--teaser">
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onViewChecklist();
            }}
          >
            Open checklist
          </Button>
          <button type="button" className="checklist-modal-dismiss" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
