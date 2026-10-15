import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { RoomScanItemSidecar } from './roomScanManifest';

export interface AgenticRoomScanSession {
  list: AgenticFurnitureListResult;
  sidecar: Record<string, RoomScanItemSidecar>;
  photos: Record<string, string>;
}
