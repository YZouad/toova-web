import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('../agenticRoomAuth', () => ({
  AGENTIC_ROOM_DEBUG: false,
  agenticRoomAuthHeaders: vi.fn(async () => ({
    headers: { Authorization: 'Bearer test-token' },
    diagnostics: {
      route: 'revise',
      hasSession: true,
      userId: 'test-user',
      userEmail: null,
      tokenLength: 10,
      expiresAt: null,
      expiresInSec: null,
      sentAuthorization: true,
      getSessionError: null,
    },
  })),
  explainAgenticRoomAuthError: (_d: unknown, err: string) => err,
  logAgenticRoomResponse: vi.fn(),
}));

import { fetchDesignerRevise } from './reviseApi';
import { buildReviseRoomSnapshot } from './roomSnapshot';
import { useStore } from '../../store';

describe('fetchDesignerRevise', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns error when network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const s = useStore.getState();
    const snapshot = buildReviseRoomSnapshot({
      items: s.items,
      order: s.order,
      environment: s.environment,
      roomGeometry: s.roomGeometry,
      selectedId: s.selectedId,
      selectedWallId: s.selectedWallId,
    });
    const result = await fetchDesignerRevise({ message: 'paint walls white', snapshot });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Bedrock|Network|toova-bff/i);
  });
});
