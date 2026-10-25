const raw = import.meta.env.VITE_AGENTIC_ROOM_API_URL;
const defaultProductionBff = 'https://toova-bff.onrender.com/api/agentic-room';

/** Dev: same-origin /api/agentic-room (Vite → BFF). Prod: explicit env or Render BFF default. */
export const AGENTIC_ROOM_API_BASE =
  typeof raw === 'string' && raw.trim() !== ''
    ? raw.trim().replace(/\/$/, '')
    : import.meta.env.PROD
      ? defaultProductionBff
      : '/api/agentic-room';

export function agenticRoomUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${AGENTIC_ROOM_API_BASE}${suffix}`;
}
