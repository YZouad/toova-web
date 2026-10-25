import { describe, expect, it } from 'vitest';
import {
  assertRoomScanImageFileSize,
  isRoomScanImageFile,
  pickKeyframeTimes,
  ROOM_SCAN_MAX_IMAGE_BYTES,
  scaleCanvasToMaxEdge,
} from './roomScanFrames';

describe('roomScanFrames', () => {
  it('picks evenly spaced keyframe times', () => {
    const times = pickKeyframeTimes(30, 10);
    expect(times).toHaveLength(10);
    expect(times[0]).toBeGreaterThan(0);
    expect(times[times.length - 1]!).toBeLessThan(30);
  });

  it('scales canvas down when long edge exceeds cap', () => {
    const scaled = scaleCanvasToMaxEdge(1920, 1080, 768);
    expect(Math.max(scaled.width, scaled.height)).toBe(768);
  });

  it('detects image files by type and extension', () => {
    expect(isRoomScanImageFile(new File(['x'], 'room.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isRoomScanImageFile(new File(['x'], 'room.png', { type: '' }))).toBe(true);
    expect(isRoomScanImageFile(new File(['x'], 'clip.mp4', { type: 'video/mp4' }))).toBe(false);
  });

  it('rejects oversized photos', () => {
    const huge = new File([new Uint8Array(ROOM_SCAN_MAX_IMAGE_BYTES + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });
    expect(() => assertRoomScanImageFileSize(huge)).toThrow(/15 MB/);
  });
});
