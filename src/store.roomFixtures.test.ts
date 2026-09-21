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

  it('resetLayout restores the Room camera preset', async () => {
    const { useStore } = await import('./store');
    useStore.getState().setCameraPreset('window');
    expect(useStore.getState().visual.cameraPreset).toBe('window');
    useStore.getState().resetLayout();
    expect(useStore.getState().visual.cameraPreset).toBe('corner');
  });

  it('paints walls independently and clears overrides on a full-room paint', async () => {
    const { useStore } = await import('./store');
    useStore.getState().resetLayout();
    const wallId = useStore.getState().roomGeometry.walls[0]!.id;
    useStore.getState().setWallPaint('#1f4f4f', wallId);
    expect(useStore.getState().environment.appearance.wallColors?.[wallId]).toBe('#1f4f4f');
    expect(useStore.getState().environment.appearance.wallColor).not.toBe('#1f4f4f');

    useStore.getState().selectWall(wallId);
    expect(useStore.getState().selectedWallId).toBe(wallId);

    useStore.getState().setAppearance({ wallColor: '#3a3a3a' });
    expect(useStore.getState().environment.appearance.wallColor).toBe('#3a3a3a');
    expect(useStore.getState().environment.appearance.wallColors).toBeUndefined();
  });
});
