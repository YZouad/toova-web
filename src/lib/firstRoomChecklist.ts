/** First-room onboarding checklist progress (per user, local + optional profile sync). */

export type FirstRoomStepId = 'place_bed' | 'add_five' | 'import_photo' | 'share_or_publish';

export interface FirstRoomStep {
  id: FirstRoomStepId;
  label: string;
  detail: string;
}

export const FIRST_ROOM_STEPS: readonly FirstRoomStep[] = [
  { id: 'place_bed', label: 'Place a bed', detail: 'Start with the piece that anchors the room.' },
  { id: 'add_five', label: 'Add 5 items', detail: 'Fill the room from the library or checklist.' },
  { id: 'import_photo', label: 'Import from a photo', detail: 'Turn a real product photo into a 3D model.' },
  { id: 'share_or_publish', label: 'Share or publish', detail: 'Send a link or put the room on your profile.' },
] as const;

export interface FirstRoomProgress {
  dismissed: boolean;
  completed: Partial<Record<FirstRoomStepId, boolean>>;
}

const storageKey = (userId: string) => `toova-first-room-checklist:${userId}`;

export function loadFirstRoomProgress(userId: string): FirstRoomProgress {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { dismissed: false, completed: {} };
    const parsed = JSON.parse(raw) as Partial<FirstRoomProgress>;
    return {
      dismissed: Boolean(parsed.dismissed),
      completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
    };
  } catch {
    return { dismissed: false, completed: {} };
  }
}

export function saveFirstRoomProgress(userId: string, progress: FirstRoomProgress): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    /* ignore quota */
  }
}

export function markFirstRoomStep(
  userId: string,
  step: FirstRoomStepId,
): FirstRoomProgress {
  const prev = loadFirstRoomProgress(userId);
  const next: FirstRoomProgress = {
    ...prev,
    completed: { ...prev.completed, [step]: true },
  };
  saveFirstRoomProgress(userId, next);
  return next;
}

export function dismissFirstRoomChecklist(userId: string): FirstRoomProgress {
  const next: FirstRoomProgress = { ...loadFirstRoomProgress(userId), dismissed: true };
  saveFirstRoomProgress(userId, next);
  return next;
}

export function deriveFirstRoomCompletions(input: {
  hasBed: boolean;
  itemCount: number;
  hasImported: boolean;
  hasSharedOrPublished: boolean;
}): Partial<Record<FirstRoomStepId, boolean>> {
  return {
    place_bed: input.hasBed,
    add_five: input.itemCount >= 5,
    import_photo: input.hasImported,
    share_or_publish: input.hasSharedOrPublished,
  };
}

export function allFirstRoomStepsDone(
  completed: Partial<Record<FirstRoomStepId, boolean>>,
): boolean {
  return FIRST_ROOM_STEPS.every((step) => completed[step.id]);
}
