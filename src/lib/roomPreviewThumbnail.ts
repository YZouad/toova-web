import { itemRect } from '../interaction/collision';
import {
  getWallSegment,
  orderedVertices,
  planBounds,
  type FloorPlan,
} from './floorPlanGeometry';
import { furniturePlanItemMarkup } from './floorPlanFurniture';
import type { Item } from '../store';

export const ROOM_THUMB_WIDTH = 1200;
export const ROOM_THUMB_HEIGHT = 630;

const BG_TOP = '#EFE6D5';
const BG_BOTTOM = '#E1D4BD';

export interface RoomThumbItem {
  id: string;
  kind: string;
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  /** Override fill for imported items (average thumbnail color). */
  tint?: string | null;
}

function hasUsableGeometry(geometry: FloorPlan | null): geometry is FloorPlan {
  return !!geometry && (geometry.vertices.length >= 3 || geometry.walls.length > 0);
}

function computeViewBox(geometry: FloorPlan | null, items: RoomThumbItem[]): string | null {
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

function buildSvgMarkup(
  geometry: FloorPlan | null,
  items: RoomThumbItem[],
  width: number,
  height: number,
): string | null {
  const floorItems = items.filter((item) => item.kind !== 'hanging');
  const viewBox = computeViewBox(geometry, floorItems);
  const showGeometry = hasUsableGeometry(geometry);
  if (!viewBox || (!showGeometry && floorItems.length === 0)) return null;

  const parts = viewBox.split(/\s+/).map(Number);
  const vbW = parts[2] || 1;
  const vbH = parts[3] || 1;
  const stroke = Math.max(vbW, vbH) * 0.012;

  const verts = showGeometry ? orderedVertices(geometry) : [];
  const floorPoints =
    verts.length >= 3 ? verts.map((v) => `${v.x},${v.z}`).join(' ') : '';

  const wallsXml = showGeometry
    ? geometry.walls
        .map((w) => {
          const seg = getWallSegment(geometry, w);
          if (!seg) return '';
          return `<line x1="${seg.start.x}" y1="${seg.start.z}" x2="${seg.end.x}" y2="${seg.end.z}" stroke="#9A7B5A" stroke-width="${stroke}" stroke-linecap="round" />`;
        })
        .join('')
    : '';

  const itemsXml = floorItems
    .map((item) => {
      const [w, , d] = item.size;
      return furniturePlanItemMarkup({
        kind: item.kind,
        cx: item.position[0],
        cz: item.position[2],
        width: w,
        depth: d,
        rotationDeg: (item.rotationY * 180) / Math.PI,
        stroke,
        tint: item.tint,
      });
    })
    .join('');

  const floorXml = floorPoints
    ? `<polygon points="${floorPoints}" fill="rgba(251,247,240,0.72)" />`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">` +
    floorXml +
    wallsXml +
    itemsXml +
    `</svg>`
  );
}

/** Rasterize the dashboard-style floor plan to a 1200×630 JPEG for OG / share previews. */
export async function renderRoomPreviewJpeg(
  geometry: FloorPlan | null,
  items: RoomThumbItem[],
  width = ROOM_THUMB_WIDTH,
  height = ROOM_THUMB_HEIGHT,
): Promise<Blob | null> {
  const svg = buildSvgMarkup(geometry, items, width, height);
  if (!svg) return null;

  try {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const grad = ctx.createLinearGradient(0, 0, width * 0.2, height);
      grad.addColorStop(0, BG_TOP);
      grad.addColorStop(1, BG_BOTTOM);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const padX = Math.round(width * 0.06);
      const padY = Math.round(height * 0.08);
      ctx.drawImage(img, padX, padY, width - padX * 2, height - padY * 2);

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg decode failed'));
    img.src = url;
  });
}
