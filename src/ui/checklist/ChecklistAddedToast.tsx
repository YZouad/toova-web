import { Button } from '../kit';

export function ChecklistAddedToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="checklist-added-toast-host" aria-live="polite">
      <div className="checklist-added-toast" role="status">
        <span className="checklist-added-toast__message">{message}</span>
        <Button size="sm" variant="mono" onClick={onDismiss}>
          OK
        </Button>
      </div>
    </div>
  );
}