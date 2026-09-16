import { describe, expect, it } from 'vitest';
import {
  FREE_PLAN_MAX_ROOMS,
  isAtRoomLimit,
  roomsRemaining,
} from './roomLimits';

describe('isAtRoomLimit', () => {
  it('caps the free plan at five rooms', () => {
    expect(isAtRoomLimit(4)).toBe(false);
    expect(isAtRoomLimit(FREE_PLAN_MAX_ROOMS)).toBe(true);
    expect(isAtRoomLimit(6)).toBe(true);
  });

  it('does not cap unlimited (Studio / admin) accounts', () => {
    expect(isAtRoomLimit(0, { unlimited: true })).toBe(false);
    expect(isAtRoomLimit(FREE_PLAN_MAX_ROOMS, { unlimited: true })).toBe(false);
    expect(isAtRoomLimit(40, { unlimited: true })).toBe(false);
  });
});

describe('roomsRemaining', () => {
  it('counts remaining free-plan slots', () => {
    expect(roomsRemaining(0)).toBe(5);
    expect(roomsRemaining(3)).toBe(2);
    expect(roomsRemaining(5)).toBe(0);
  });

  it('returns null for unlimited accounts', () => {
    expect(roomsRemaining(12, { unlimited: true })).toBeNull();
  });
});
