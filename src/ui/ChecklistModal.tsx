import { useEffect } from 'react';

interface ChecklistModalProps {
  open: boolean;
  onClose: () => void;
  onViewChecklist: () => void;
}

/** Compact promo teaser — full list lives on the checklist page. */
export function ChecklistModal({ open, onClose, onViewChecklist }: ChecklistModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="checklist-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="checklist-modal checklist-modal--teaser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checklist-modal-title"
      >
        <button type="button" className="checklist-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="checklist-modal-eyebrow">Move-in ready</p>
        <h2 id="checklist-modal-title" className="checklist-modal-title">
          Get the Toova checklist
        </h2>
        <p className="checklist-modal-hint">
          A dorm essentials list you can check off as you shop — then design your room so you know what fits.
        </p>
        <div className="checklist-modal-footer checklist-modal-footer--teaser">
          <button
            type="button"
            className="tv-btn-primary"
            onClick={() => {
              onClose();
              onViewChecklist();
            }}
          >
            Open checklist
          </button>
          <button type="button" className="checklist-modal-dismiss" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
