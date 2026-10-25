import type { Item, RoomEnvironment } from '../../store';
import type { RoomGeometry } from '../roomGeometry';

export interface ReviseUndoSnapshot {
  items: Record<string, Item>;
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
}

export function captureReviseUndoSnapshot(state: {
  items: Record<string, Item>;
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
}): ReviseUndoSnapshot {
  return {
    items: structuredClone(state.items),
    order: [...state.order],
    environment: structuredClone(state.environment),
    roomGeometry: structuredClone(state.roomGeometry),
  };
}
