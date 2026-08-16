import { itemRect } from '../interaction/collision';
import {
  getWallSegment,
  orderedVertices,
  planBounds,
  type FloorPlan,
} from '../lib/floorPlanGeometry';
import { furnitureFill } from '../lib/floorPlanFurniture';
import type { Item } from '../store';

export { KIND_COLORS } from '../lib/floorPlanFurniture';

export interface RoomPreviewItem {
  id: string;
  kind: string;
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  /** Imported GLB storage path (for thumbnail tint lookup). */
  modelUrl?: string | null;
  /** Override fill for imported items (average thumbnail color). */
  tint?: string | null;
}

function hasUsableGeometry(geometry: FloorPlan | null): geometry is FloorPlan {
  return !!geometry && (geometry.vertices.length >= 3 || geometry.walls.length > 0);
}

function computeViewBox(geometry: FloorPlan | null, items: RoomPreviewItem[]): string | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  if (hasUsableGeometry(geometry)) {
    const b = planBounds(geometry);
    minX = b.minX;
    maxX = b.maxX;
    minZ = b.minZ;
    maxZ = b.maxZ;
  }

  for (const item of items) {
    const r = itemRect(item as Item);
    minX = Math.min(minX, r.minX);
    maxX = Math.max(maxX, r.maxX);
    minZ = Math.min(minZ, r.minZ);
    maxZ = Math.max(maxZ, r.maxZ);
  }

  if (!Number.isFinite(minX)) return null;

  const w = maxX - minX;
  const h = maxZ - minZ;
  const pad = Math.max(8, Math.max(w, h) * 0.08);
  return `${minX - pad} ${minZ - pad} ${w + pad * 2} ${h + pad * 2}`;
}

interface RoomPreviewProps {
  geometry: FloorPlan | null;
  items: RoomPreviewItem[];
}

/** Floor furniture only — hanging garlands/LEDs use large AABBs that wash out the plan. */
export function floorPreviewItems(items: RoomPreviewItem[]): RoomPreviewItem[] {
  return items.filter((item) => item.kind !== 'hanging' && item.kind !== 'light');
}

export function RoomPreview({ geometry, items }: RoomPreviewProps) {
  const floorItems = floorPreviewItems(items);
  const viewBox = computeViewBox(geometry, floorItems);
  const showGeometry = hasUsableGeometry(geometry);

  if (!viewBox || (!showGeometry && floorItems.length === 0)) {
    return null;
  }

  const verts = showGeometry ? orderedVertices(geometry) : [];
  const floorPoints = verts.length >= 3 ? verts.map((v) => `${v.x},${v.z}`).join(' ') : '';

  return (
    <svg
      className="room-preview-svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {floorPoints ? <polygon className="room-preview-floor" points={floorPoints} /> : null}
      {showGeometry
        ? geometry.walls.map((w) => {
            const seg = getWallSegment(geometry, w);
            if (!seg) return null;
            return (
              <line
                key={w.id}
                className="room-preview-wall"
                x1={seg.start.x}
                y1={seg.start.z}
                x2={seg.end.x}
                y2={seg.end.z}
              />
            );
          })
        : null}
      {floorItems.map((item) => {
        const [w, , d] = item.size;
        const cx = item.position[0];
        const cz = item.position[2];
        const fill = item.tint || furnitureFill(item.kind);
        const deg = (item.rotationY * 180) / Math.PI;
        return (
          <rect
            key={item.id}
            className="room-preview-furniture"
            x={cx - w / 2}
            y={cz - d / 2}
            width={w}
            height={d}
            fill={fill}
            transform={`rotate(${deg} ${cx} ${cz})`}
          />
        );
      })}
    </svg>
  );
}
