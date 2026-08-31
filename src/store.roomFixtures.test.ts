import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  vi.stubGlobal('window', {
    gtag: undefined,
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
});

describe('toggleRoomFixtures', () => {
  it('toggles recessed lights and lamp emitters', async () => {
    const { useStore } = await import('./store');
    useStore.getState().resetLayout();
    const lampId = useStore.getState().addItem('lamp');
    expect(useStore.getState().items[lampId]?.emitter?.enabled).toBe(false);

    useStore.getState().toggleRoomFixtures(true);
    expect(useStore.getState().environment.appearance.recessedLights).toBe(true);
    expect(useStore.getState().items[lampId]?.emitter?.enabled).toBe(true);
    expect(useStore.getState().roomFixturesLit()).toBe(true);

    useStore.getState().toggleRoomFixtures(false);
    expect(useStore.getState().environment.appearance.recessedLights).toBe(false);
    expect(useStore.getState().items[lampId]?.emitter?.enabled).toBe(false);
  });
});
