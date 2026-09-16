/** Free-plan room cap. Studio / admin accounts skip this via `unlimited`. */
export const FREE_PLAN_MAX_ROOMS = 5;

export function isAtRoomLimit(
  roomCount: number,
  options?: { unlimited?: boolean },
): boolean {
  if (options?.unlimited) return false;
  return roomCount >= FREE_PLAN_MAX_ROOMS;
}

export function roomsRemaining(
  roomCount: number,
  options?: { unlimited?: boolean },
): number | null {
  if (options?.unlimited) return null;
  return Math.max(0, FREE_PLAN_MAX_ROOMS - roomCount);
}
