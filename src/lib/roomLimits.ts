/** Free-plan room cap. Studio / admin accounts skip this via `unlimited`. */
export const FREE_PLAN_MAX_ROOMS = 5;

export function isAtRoomLimit(
  roomCount: number,
  options?: { unlimited?: boolean; maxRooms?: number | null },
): boolean {
  if (options?.unlimited) return false;
  const cap = options?.maxRooms ?? FREE_PLAN_MAX_ROOMS;
  if (cap == null) return false;
  return roomCount >= cap;
}

export function roomsRemaining(
  roomCount: number,
  options?: { unlimited?: boolean; maxRooms?: number | null },
): number | null {
  if (options?.unlimited) return null;
  const cap = options?.maxRooms ?? FREE_PLAN_MAX_ROOMS;
  if (cap == null) return null;
  return Math.max(0, cap - roomCount);
}
