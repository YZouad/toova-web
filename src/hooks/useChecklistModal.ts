import { useCallback, useState } from 'react';

/** Auto-opens the checklist teaser every time this screen mounts. */
export function useChecklistModal() {
  const [open, setOpen] = useState(true);

  const openChecklist = useCallback(() => {
    setOpen(true);
  }, []);

  const closeChecklist = useCallback(() => {
    setOpen(false);
  }, []);

  return { open, openChecklist, closeChecklist };
}
