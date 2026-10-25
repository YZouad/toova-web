import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { RoomScanItemSidecar } from './roomScanManifest';

export interface AgenticRoomScanSession {
  list: AgenticFurnitureListResult;
  sidecar: Record<string, RoomScanItemSidecar>;
  photos: Record<string, string>;
  /** Best frame for color sampling (first or primary keyframe). */
  primaryFrame: string;
  /** Session-only frames for optional re-analyze (not persisted). */
  frames?: string[];
}
