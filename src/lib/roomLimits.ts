/** @deprecated Prefer useEntitlements().maxRooms — kept for call sites during migration. */
export const FREE_PLAN_MAX_ROOMS = 5;

export function isAtRoomLimit(
  roomCount: number,
  options?: { unlimited?: boolean; maxRooms?: number | null },
): boolean {
  if (options?.unlimited) return false;
  if (options && 'maxRooms' in (options ?? {}) && options.maxRooms == null) return false;
  const cap = options?.maxRooms ?? FREE_PLAN_MAX_ROOMS;
  return roomCount >= cap;
}

export function isOverRoomLimit(
  roomCount: number,
  options?: { unlimited?: boolean; maxRooms?: number | null },
): boolean {
  if (options?.unlimited) return false;
  if (options && 'maxRooms' in (options ?? {}) && options.maxRooms == null) return false;
  const cap = options?.maxRooms ?? FREE_PLAN_MAX_ROOMS;
  return roomCount > cap;
}

export function roomsRemaining(
  roomCount: number,
  options?: { unlimited?: boolean; maxRooms?: number | null },
): number | null {
  if (options?.unlimited) return null;
  if (options && 'maxRooms' in (options ?? {}) && options.maxRooms == null) return null;
  const cap = options?.maxRooms ?? FREE_PLAN_MAX_ROOMS;
  return Math.max(0, cap - roomCount);
}
