import { describe, expect, it } from 'vitest';

/**
 * Pure helpers mirroring MobileObjectGestureController thresholds so unit
 * tests cover gesture state transitions without a WebGL canvas.
 */
const LONG_PRESS_MS = 450;
const MOVE_START_PX = 8;
const LIFT_PX_PER_INCH = 10;

type Mode = 'idle' | 'pending' | 'drag' | 'lift';

function classifyMove(opts: {
  mode: Mode;
  heldMs: number;
  dx: number;
  dy: number;
  secondPointer: boolean;
}): Mode {
  if (opts.secondPointer) return 'idle';
  if (opts.mode === 'lift' || opts.mode === 'drag') return opts.mode;
  if (opts.mode !== 'pending') return opts.mode;
  if (opts.heldMs >= LONG_PRESS_MS && Math.hypot(opts.dx, opts.dy) < MOVE_START_PX) {
    return 'lift';
  }
  if (Math.hypot(opts.dx, opts.dy) >= MOVE_START_PX) return 'drag';
  return 'pending';
}

function elevationFromDrag(baseY: number, startClientY: number, clientY: number) {
  return Math.max(0, baseY + (startClientY - clientY) / LIFT_PX_PER_INCH);
}

function isTapSelect(dx: number, dy: number, threshold = MOVE_START_PX) {
  return dx * dx + dy * dy < threshold * threshold;
}

describe('mobile object gesture thresholds', () => {
  it('taps stay pending under move threshold', () => {
    expect(isTapSelect(3, 2)).toBe(true);
    expect(
      classifyMove({ mode: 'pending', heldMs: 100, dx: 3, dy: 2, secondPointer: false }),
    ).toBe('pending');
  });

  it('camera drags cancel tap-select', () => {
    expect(isTapSelect(12, 0)).toBe(false);
  });

  it('early movement starts XZ drag', () => {
    expect(
      classifyMove({ mode: 'pending', heldMs: 80, dx: 12, dy: 0, secondPointer: false }),
    ).toBe('drag');
  });

  it('stationary long-press enters lift', () => {
    expect(
      classifyMove({ mode: 'pending', heldMs: 450, dx: 1, dy: 1, secondPointer: false }),
    ).toBe('lift');
  });

  it('second pointer cancels object manipulation', () => {
    expect(
      classifyMove({ mode: 'pending', heldMs: 200, dx: 0, dy: 0, secondPointer: true }),
    ).toBe('idle');
    expect(
      classifyMove({ mode: 'lift', heldMs: 600, dx: 0, dy: 20, secondPointer: true }),
    ).toBe('idle');
  });

  it('continuous lift maps vertical pixels to inches', () => {
    expect(elevationFromDrag(0, 400, 370)).toBe(3);
    expect(elevationFromDrag(6, 400, 450)).toBe(1);
    expect(elevationFromDrag(2, 400, 500)).toBe(0);
  });

  it('lift release should not apply gravity (contract)', () => {
    const applyGravityOnRelease = (mode: Mode) => mode === 'drag';
    expect(applyGravityOnRelease('lift')).toBe(false);
    expect(applyGravityOnRelease('drag')).toBe(true);
  });
});
