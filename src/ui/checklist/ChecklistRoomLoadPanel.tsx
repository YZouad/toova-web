import { Spinner } from '../kit';

export function ChecklistRoomLoadPanel({
  label = 'Loading checklist for this room…',
}: {
  label?: string;
}) {
  return (
    <div className="checklist-room-load" role="status" aria-live="polite">
      <Spinner label={label} />
    </div>
  );
}