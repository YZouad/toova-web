import type { Item, RoomEnvironment } from '../../store';
import type { RoomGeometry } from '../roomGeometry';
import { wallPaintColor } from '../roomAppearance';
import { allWallSegments } from '../roomGeometry';

export interface ReviseRoomSnapshotItem {
  id: string;
  kind: string;
  label: string;
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  tintColor?: string;
  blanketColor?: string;
  mattressColor?: string;
  topColor?: string;
  drawerColor?: string;
  catalogKind?: string;
}

export interface ReviseRoomSnapshot {
  walls: Array<{ id: string; color: string }>;
  appearance: {
    wallColor: string;
    floorPreset: string;
    trimPreset: string;
    showBaseboards: boolean;
  };
  curtains: Array<{ openingId: string; color?: string }>;
  items: ReviseRoomSnapshotItem[];
  selection: {
    itemId: string | null;
    wallId: string | null;
  };
}

function snapshotItem(item: Item): ReviseRoomSnapshotItem {
  return {
    id: item.id,
    kind: item.kind,
    label: item.label ?? item.kind,
    position: [...item.position] as [number, number, number],
    rotationY: item.rotationY,
    size: [...item.size] as [number, number, number],
    ...(item.tintColor ? { tintColor: item.tintColor } : {}),
    ...(item.blanketColor ? { blanketColor: item.blanketColor } : {}),
    ...(item.mattressColor ? { mattressColor: item.mattressColor } : {}),
    ...(item.topColor ? { topColor: item.topColor } : {}),
    ...(item.drawerColor ? { drawerColor: item.drawerColor } : {}),
    ...(item.catalogKind ? { catalogKind: item.catalogKind } : {}),
  };
}

export function buildReviseRoomSnapshot(input: {
  items: Record<string, Item>;
  order: string[];
  environment: RoomEnvironment;
  roomGeometry: RoomGeometry;
  selectedId: string | null;
  selectedWallId: string | null;
}): ReviseRoomSnapshot {
  const { appearance } = input.environment;
  const walls = allWallSegments(input.roomGeometry).map((seg) => ({
    id: seg.wall.id,
    color: wallPaintColor(appearance, seg.wall.id),
  }));

  const curtains = input.roomGeometry.openings
    .filter((o) => o.kind === 'window')
    .map((o) => ({
      openingId: o.id,
      color: o.curtains?.color,
    }));

  const items = input.order
    .map((id) => input.items[id])
    .filter((it): it is Item => !!it && it.kind !== 'light')
    .map(snapshotItem);

  return {
    walls,
    appearance: {
      wallColor: appearance.wallColor,
      floorPreset: appearance.floorPreset,
      trimPreset: appearance.trimPreset,
      showBaseboards: appearance.showBaseboards,
    },
    curtains,
    items,
    selection: {
      itemId: input.selectedId,
      wallId: input.selectedWallId,
    },
  };
}
