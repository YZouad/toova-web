import {
  Button,
  Modal,
} from './kit';

interface ChecklistModalProps {
  open: boolean;
  onClose: () => void;
  onViewChecklist: () => void;
}

/** Compact promo teaser — full list lives on the checklist page. */
export function ChecklistModal({ open, onClose, onViewChecklist }: ChecklistModalProps) {
  return (
    <Modal
      open={open}
      meta="Move-in ready"
      title="Get the Toova checklist"
      onClose={onClose}
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose}>
            Not now
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onViewChecklist();
            }}
          >
            Open checklist
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, font: 'var(--type-body-sm)', color: 'var(--ink-4)', lineHeight: 1.5 }}>
        A dorm essentials list you can check off as you shop — then design your room so you know what fits.
      </p>
    </Modal>
  );
}
