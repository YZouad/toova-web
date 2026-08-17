import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildGuestSnapshot,
  isGuestWorkspaceId,
  loadGuestDesignSnapshot,
  saveGuestDesignSnapshot,
  clearGuestDesignSnapshot,
} from './guestDesignSnapshot';
import { rectanglePlan } from './floorPlanGeometry';
import { DEFAULT_ENVIRONMENT, newAttachmentKey, type Item } from '../store';
import { ROOM } from '../units';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
}

function sampleItem(id: string): Item {
  return {
    id,
    kind: 'desk',
    position: [40, 0, 40],
    rotationY: 0,
    size: [48, 30, 24],
    label: 'Desk',
    attachmentKey: newAttachmentKey(),
  };
}

describe('guestDesignSnapshot', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    clearGuestDesignSnapshot();
  });

  it('detects guest workspace ids', () => {
    expect(isGuestWorkspaceId('guest-123')).toBe(true);
    expect(isGuestWorkspaceId('abc')).toBe(false);
    expect(isGuestWorkspaceId(null)).toBe(false);
  });

  it('round-trips a design snapshot through localStorage', () => {
    const item = sampleItem('item-1');
    const snapshot = buildGuestSnapshot({
      name: 'Guest dorm',
      templateId: 'balanced-dorm',
      items: { [item.id]: item },
      order: [item.id],
      environment: { ...DEFAULT_ENVIRONMENT },
      roomGeometry: rectanglePlan(ROOM.width, ROOM.depth, ROOM.height),
    });
    saveGuestDesignSnapshot(snapshot);
    const loaded = loadGuestDesignSnapshot();
    expect(loaded?.name).toBe('Guest dorm');
    expect(loaded?.templateId).toBe('balanced-dorm');
    expect(loaded?.order).toEqual(['item-1']);
    expect(loaded?.items[0]?.kind).toBe('desk');
    expect(loaded?.roomGeometry.vertices.length).toBeGreaterThanOrEqual(4);
    clearGuestDesignSnapshot();
    expect(loadGuestDesignSnapshot()).toBeNull();
  });
});
