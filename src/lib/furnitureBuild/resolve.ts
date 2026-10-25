import { FURNITURE, type GalleryFurnitureKind } from '../../furniture/registry';
import { limitsForCabinetKind, resolveCabinetDrawerGrid } from './cabinetDrawerGrid';
import { normalizeDeskPullOut, normalizeDeskSidePedestal } from './deskPullOut';
import { defaultBuildForKind, KIND_BUILD_DEFAULTS } from './defaults';
import type {
  ChairBack,
  ChairStyle,
  DeskPedestal,
  DrawerArrangement,
  FurnitureBuild,
} from './types';
import { kindSupportsBuild } from './types';

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampPositive(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parsePedestal(query: string): DeskPedestal | undefined {
  const n = query.toLowerCase();
  if (/\bboth\s+sides?\b.*\bdrawers?\b|\bdrawers?\s+on\s+both\b/i.test(n)) return 'both';
  if (/\bdrawers?\s+on\s+the\s+left\b|\bleft\s+(?:pedestal|drawers?|side)\b|\bside\s+cabinet\s+on\s+the\s+left\b/i.test(n)) {
    return 'left';
  }
  if (/\bdrawers?\s+on\s+the\s+right\b|\bright\s+(?:pedestal|drawers?|side)\b|\bside\s+cabinet\s+on\s+the\s+right\b/i.test(n)) {
    return 'right';
  }
  if (
    /\b(under(neath)?|below|center|middle)\s+(the\s+)?(desk|desktop|top)\b/i.test(n) ||
    /\bdrawers?\s+under(neath)?\b/i.test(n) ||
    (/\bunder(neath)?\b/i.test(n) && /\bdesk\b/i.test(n)) ||
    /\bcenter\s+drawers?\b/i.test(n)
  ) {
    return 'center';
  }
  if (
    /\b(writing|student|school)\s+desk\b/i.test(n) ||
    /\bdrawers?\s+(across|along)\s+the\s+front\b/i.test(n) ||
    /\bfront\s+drawers?\b/i.test(n)
  ) {
    return 'front';
  }
  if (/\b(pedestal|drawer)\s+desk\b|\bexecutive\s+desk\b/i.test(n)) return 'both';
  if (/\bdrawers?\s+on\s+the\s+side\b/i.test(n)) return 'right';
  return undefined;
}

function parseDrawerCount(query: string): number | undefined {
  const wide = query.match(/\b(\d+)\s*wide\s*drawers?\b/i);
  if (wide) return clampInt(Number(wide[1]), 1, 8);
  const m = query.match(/\b(\d+)\s*[- ]?\s*drawers?\b/i);
  if (m) return clampInt(Number(m[1]), 1, 8);
  const m2 = query.match(/\b(\d+)\s*[- ]?\s*drawer\b/i);
  if (m2) return clampInt(Number(m2[1]), 1, 8);
  return undefined;
}

function parseColumnCount(query: string): number | undefined {
  const m = query.match(/\b(\d+)\s*[- ]?\s*columns?\b/i);
  if (m) return clampInt(Number(m[1]), 1, 4);
  const wide = query.match(/\b(\d+)\s*wide\s*drawers?\b/i);
  if (wide) return clampInt(Number(wide[1]), 1, 4);
  return undefined;
}

function parseDrawerArrangement(query: string): DrawerArrangement | undefined {
  const n = query.toLowerCase();
  if (
    /\b(side\s+by\s+side|side-by-side|horizontal|in\s+a\s+row)\b/.test(n) &&
    /\bdrawers?\b/.test(n)
  ) {
    return 'wide';
  }
  if (/\bwide\s+drawers?\b|\bdrawers?\s+wide\b|\b(\d+)\s*wide\s*drawers?\b/i.test(n)) {
    return 'wide';
  }
  if (/\bstack(ed)?\s+drawers?\b|\bvertical\s+drawers?\b|\btall\s+drawers?\b/.test(n)) {
    return 'stack';
  }
  if (/\bgrid\b.*\bdrawers?\b|\bdrawers?\b.*\bgrid\b/.test(n)) return 'grid';
  return undefined;
}

function parseShelfBays(query: string): number | undefined {
  const m = query.match(/\b(\d+)\s*[- ]?\s*(?:shelf|shelves|tier|tiers)\b/i);
  if (m) return clampInt(Number(m[1]), 1, 8);
  const m2 = query.match(/\b(\d+)\s*[- ]?\s*shelf\s+unit\b/i);
  if (m2) return clampInt(Number(m2[1]), 1, 8);
  return undefined;
}

function parseBoardCount(query: string): number | undefined {
  const m = query.match(/\b(\d+)\s*[- ]?\s*(?:board|boards|floating\s+shelves?)\b/i);
  if (m) return clampInt(Number(m[1]), 1, 5);
  return undefined;
}

function parseChairStyle(query: string): ChairStyle | undefined {
  const n = query.toLowerCase();
  if (/\barm\s?chair\b|\barmchair\b/.test(n)) return 'armchair';
  if (/\bstool\b|\bbar\s+stool\b/.test(n)) return 'stool';
  return undefined;
}

function parseChairBack(query: string): ChairBack | undefined {
  if (/\bslat(?:ted)?\s+back\b/i.test(query)) return 'slats';
  return undefined;
}

function parseInchDim(query: string, label: string): number | undefined {
  const re = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(?:\"|in|inch|inches)?\\s*${label}\\b`, 'i');
  const m = query.match(re);
  if (m) return clampPositive(Number(m[1]), 0);
  const re2 = new RegExp(`\\b${label}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:\"|in|inch|inches)?\\b`, 'i');
  const m2 = query.match(re2);
  if (m2) return clampPositive(Number(m2[1]), 0);
  return undefined;
}

function sniffBuildFromQuery(kind: GalleryFurnitureKind, query: string): FurnitureBuild {
  const out: FurnitureBuild = {};
  const drawers = parseDrawerCount(query);
  const columns = parseColumnCount(query);
  const shelves = parseShelfBays(query);
  const boards = parseBoardCount(query);
  const pedestal = parsePedestal(query);
  const drawerArrangement = parseDrawerArrangement(query);
  const style = parseChairStyle(query);
  const backStyle = parseChairBack(query);

  const w = parseInchDim(query, 'wide') ?? parseInchDim(query, 'width');
  const h = parseInchDim(query, 'tall') ?? parseInchDim(query, 'height');
  const d = parseInchDim(query, 'deep') ?? parseInchDim(query, 'depth');
  if (w) out.widthIn = w;
  if (h) out.heightIn = h;
  if (d) out.depthIn = d;

  switch (kind) {
    case 'dresser':
    case 'nightstand': {
      const grid = query.match(/\b(\d+)\s*[x×]\s*(\d+)\s*drawers?\b/i);
      if (grid) {
        out.drawerRows = clampInt(Number(grid[1]), 1, 8);
        out.drawerColumns = clampInt(Number(grid[2]), 1, kind === 'nightstand' ? 2 : 4);
      }
      if (drawers != null) out.drawers = drawers;
      if (columns != null) out.columns = columns;
      if (drawerArrangement) out.drawerArrangement = drawerArrangement;
      break;
    }
    case 'desk': {
      if (pedestal) out.deskPedestal = pedestal;
      if (drawers != null) out.drawers = drawers;
      if (columns != null) out.columns = columns;
      if (drawerArrangement) out.drawerArrangement = drawerArrangement;
      if (/\bfilled\s+sides?\b|\bside\s+panels?\b/i.test(query)) out.deskBase = 'panels';
      if (/\bback\s+panel\b|\bmodesty\s+panel\b/i.test(query)) out.deskBackPanel = true;
      const pullW = query.match(
        /\b(\d+(?:\.\d+)?)\s*(?:\"|in|inch|inches)?\s*(?:wide|width)\b/i,
      );
      const pullD = query.match(
        /\b(\d+(?:\.\d+)?)\s*(?:\"|in|inch|inches)?\s*(?:deep|depth)\b/i,
      );
      const pullH = query.match(
        /\b(\d+(?:\.\d+)?)\s*(?:\"|in|inch|inches)?\s*(?:tall|high|height)\b/i,
      );
      if (pullW && /\b(under|pull[- ]?out|pencil)\s*drawer\b/i.test(query)) {
        out.pullOutWidthIn = clampPositive(Number(pullW[1]), 0);
      }
      if (pullD && /\b(under|pull[- ]?out|pencil)\s*drawer\b/i.test(query)) {
        out.pullOutDepthIn = clampPositive(Number(pullD[1]), 0);
      }
      if (pullH && /\b(under|pull[- ]?out|pencil)\s*drawer\b/i.test(query)) {
        out.pullOutHeightIn = clampPositive(Number(pullH[1]), 0);
      }
      break;
    }
    case 'bookshelf':
      if (shelves != null) out.shelves = shelves;
      if (columns != null) out.bookshelfColumns = columns;
      if (/\bopen\s+back\b/i.test(query)) out.back = false;
      break;
    case 'shelf':
      if (boards != null) out.boards = boards;
      break;
    case 'chair':
      if (style) out.style = style;
      if (backStyle) out.backStyle = backStyle;
      break;
    default:
      break;
  }
  return out;
}

function normalizeHeights(heights: unknown, rowCount: number): number[] | undefined {
  if (!Array.isArray(heights) || heights.length === 0) return undefined;
  const nums = heights
    .map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null))
    .filter((v): v is number => v != null);
  if (nums.length === 0) return undefined;
  while (nums.length < rowCount) nums.push(nums[nums.length - 1] ?? 1);
  return nums.slice(0, rowCount);
}

function mergeBuild(
  kind: GalleryFurnitureKind,
  raw: FurnitureBuild | undefined,
  sniffed: FurnitureBuild,
): FurnitureBuild {
  const d = KIND_BUILD_DEFAULTS[kind as keyof typeof KIND_BUILD_DEFAULTS];
  if (!d) return {};

  const merged: FurnitureBuild = {
    ...sniffed,
    ...raw,
  };

  switch (kind) {
    case 'dresser':
    case 'nightstand': {
      const grid = resolveCabinetDrawerGrid(
        merged,
        d.drawers,
        limitsForCabinetKind(kind, false),
      );
      const heights = normalizeHeights(merged.heights, grid.drawerRows);
      return {
        drawers: grid.drawers,
        drawerRows: grid.drawerRows,
        drawerColumns: grid.drawerColumns,
        columns: grid.columns,
        ...(heights ? { heights } : {}),
        ...(merged.widthIn && merged.widthIn >= 12 ? { widthIn: merged.widthIn } : {}),
        ...(merged.heightIn && merged.heightIn >= 12 ? { heightIn: merged.heightIn } : {}),
        ...(merged.depthIn && merged.depthIn >= 12 ? { depthIn: merged.depthIn } : {}),
      };
    }
    case 'desk': {
      const side = normalizeDeskSidePedestal(merged.deskPedestal);
      const pullOut = normalizeDeskPullOut(merged.deskPullOut, merged.deskPedestal);
      const out: FurnitureBuild = {};
      if (side !== 'none') out.deskPedestal = side;
      if (pullOut !== 'none') out.deskPullOut = pullOut;
      if (side !== 'none') {
        const drawerMax = 4;
        const drawers = clampInt(merged.drawers ?? d.drawers, 1, drawerMax);
        const grid = resolveCabinetDrawerGrid(
          { ...merged, drawers },
          d.drawers,
          limitsForCabinetKind('desk', false),
        );
        out.drawers = grid.drawers;
        out.drawerRows = grid.drawerRows;
        out.drawerColumns = grid.drawerColumns;
        out.columns = grid.columns;
        if (merged.drawerArrangement) out.drawerArrangement = merged.drawerArrangement;
      }
      if (typeof merged.pullOutWidthIn === 'number') {
        out.pullOutWidthIn = clampPositive(merged.pullOutWidthIn, 0);
      }
      if (typeof merged.pullOutDepthIn === 'number') {
        out.pullOutDepthIn = clampPositive(merged.pullOutDepthIn, 0);
      }
      if (typeof merged.pullOutHeightIn === 'number') {
        out.pullOutHeightIn = clampPositive(merged.pullOutHeightIn, 0);
      }
      if (merged.deskBase === 'panels') out.deskBase = 'panels';
      if (merged.deskBackPanel === true) out.deskBackPanel = true;
      if (merged.widthIn) out.widthIn = merged.widthIn;
      if (merged.heightIn) out.heightIn = merged.heightIn;
      if (merged.depthIn) out.depthIn = merged.depthIn;
      return out;
    }
    case 'bookshelf': {
      const shelves = clampInt(merged.shelves ?? d.shelves, 1, 8);
      const bookshelfColumns = clampInt(merged.bookshelfColumns ?? merged.columns ?? d.bookshelfColumns, 1, 4);
      const back = merged.back ?? d.back;
      const out: FurnitureBuild = { shelves, bookshelfColumns, back };
      if (merged.widthIn) out.widthIn = merged.widthIn;
      if (merged.heightIn) out.heightIn = merged.heightIn;
      if (merged.depthIn) out.depthIn = merged.depthIn;
      return out;
    }
    case 'shelf': {
      const boards = clampInt(merged.boards ?? d.boards, 1, 5);
      const gap = clampPositive(merged.gap ?? d.gap, d.gap);
      const out: FurnitureBuild = { boards, gap };
      if (merged.widthIn) out.widthIn = merged.widthIn;
      if (merged.heightIn) out.heightIn = merged.heightIn;
      if (merged.depthIn) out.depthIn = merged.depthIn;
      return out;
    }
    case 'chair': {
      const style: ChairStyle =
        merged.style === 'armchair' || merged.style === 'stool' ? merged.style : d.style;
      const backStyle: ChairBack =
        merged.backStyle === 'slats' ? 'slats' : d.backStyle;
      const out: FurnitureBuild =
        style === 'stool' ? { style } : { style, backStyle: style === 'side' ? backStyle : 'solid' };
      if (merged.widthIn) out.widthIn = merged.widthIn;
      if (merged.heightIn) out.heightIn = merged.heightIn;
      if (merged.depthIn) out.depthIn = merged.depthIn;
      return out;
    }
    default:
      return {};
  }
}

/** Full build for rendering (always includes clamped fields). */
export function buildForRender(
  kind: GalleryFurnitureKind,
  build?: FurnitureBuild | null,
): FurnitureBuild {
  return mergeBuild(kind, build ?? undefined, {});
}

function omitIfDefault(
  kind: GalleryFurnitureKind,
  resolved: FurnitureBuild,
): FurnitureBuild | undefined {
  const defaults = defaultBuildForKind(kind);
  if (!defaults) return resolved;
  if (JSON.stringify(resolved) === JSON.stringify(defaults)) return undefined;
  return resolved;
}

/** Inspector / store edits — do not re-parse item.label (avoids "4-drawer" labels overriding the stepper). */
export function resolveFurnitureBuildExplicit(
  kind: GalleryFurnitureKind,
  raw?: FurnitureBuild | null,
): FurnitureBuild | undefined {
  if (!kindSupportsBuild(kind)) return undefined;
  return omitIfDefault(kind, mergeBuild(kind, raw ?? undefined, {}));
}

/** Returns undefined when the resolved build matches kind defaults (omit on Item). */
export function resolveFurnitureBuild(
  kind: GalleryFurnitureKind,
  query: string,
  raw?: FurnitureBuild | null,
): FurnitureBuild | undefined {
  if (!kindSupportsBuild(kind)) return undefined;
  const sniffed = sniffBuildFromQuery(kind, query);
  const resolved = mergeBuild(kind, raw ?? undefined, sniffed);
  return omitIfDefault(kind, resolved);
}

export function applyBuildSizeOverride(
  kind: GalleryFurnitureKind,
  baseSize: [number, number, number],
  build: FurnitureBuild | undefined,
): [number, number, number] {
  if (!build) return baseSize;
  let [w, h, d] = baseSize;
  if (build.widthIn) w = build.widthIn;
  if (build.heightIn) h = build.heightIn;
  if (build.depthIn) d = build.depthIn;

  if (kind === 'chair' && build.style === 'armchair' && !build.widthIn) {
    w = Math.max(w, FURNITURE.chair.size[0] + 6);
  }

  if (kind === 'shelf' && build.boards && build.boards > 1) {
    const def = FURNITURE.shelf;
    const thickness = Math.max(0.4, def.size[1]);
    const gap = clampPositive(build.gap ?? 8, 8);
    h = thickness * build.boards + gap * (build.boards - 1);
  }

  return [w, h, d];
}

export function parseFurnitureBuild(raw: unknown): FurnitureBuild | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const build: FurnitureBuild = {};
  if (typeof o.drawers === 'number') build.drawers = o.drawers;
  if (typeof o.columns === 'number') build.columns = o.columns;
  if (typeof o.drawerRows === 'number') build.drawerRows = o.drawerRows;
  if (typeof o.drawerColumns === 'number') build.drawerColumns = o.drawerColumns;
  if (o.drawerArrangement === 'stack' || o.drawerArrangement === 'wide' || o.drawerArrangement === 'grid') {
    build.drawerArrangement = o.drawerArrangement;
  }
  if (typeof o.bookshelfColumns === 'number') build.bookshelfColumns = o.bookshelfColumns;
  if (Array.isArray(o.heights)) build.heights = o.heights as number[];
  if (
    o.deskPedestal === 'none' ||
    o.deskPedestal === 'left' ||
    o.deskPedestal === 'right' ||
    o.deskPedestal === 'both' ||
    o.deskPedestal === 'center' ||
    o.deskPedestal === 'front'
  ) {
    build.deskPedestal = o.deskPedestal;
  }
  if (o.deskPullOut === 'none' || o.deskPullOut === 'front' || o.deskPullOut === 'center') {
    build.deskPullOut = o.deskPullOut;
  }
  if (typeof o.pullOutWidthIn === 'number') build.pullOutWidthIn = o.pullOutWidthIn;
  if (typeof o.pullOutDepthIn === 'number') build.pullOutDepthIn = o.pullOutDepthIn;
  if (typeof o.pullOutHeightIn === 'number') build.pullOutHeightIn = o.pullOutHeightIn;
  if (o.deskBase === 'legs' || o.deskBase === 'panels') build.deskBase = o.deskBase;
  if (o.deskBackPanel === true) build.deskBackPanel = true;
  if (typeof o.shelves === 'number') build.shelves = o.shelves;
  if (typeof o.back === 'boolean') build.back = o.back;
  if (typeof o.boards === 'number') build.boards = o.boards;
  if (typeof o.gap === 'number') build.gap = o.gap;
  if (o.style === 'side' || o.style === 'armchair' || o.style === 'stool') build.style = o.style;
  if (o.backStyle === 'solid' || o.backStyle === 'slats') build.backStyle = o.backStyle;
  if (typeof o.widthIn === 'number') build.widthIn = o.widthIn;
  if (typeof o.heightIn === 'number') build.heightIn = o.heightIn;
  if (typeof o.depthIn === 'number') build.depthIn = o.depthIn;
  return Object.keys(build).length ? build : undefined;
}
