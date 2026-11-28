import { ROOM } from '../../units';
import { hasEnclosedFootprint } from '../floorPlanGeometry';
import { assignFaceMarks, buildMarkList } from './marks';
import { classifyGaps } from './openings';
import { rgbaToGray } from './raster';
import {
  consensusScale,
  estimateScaleFromArea,
  estimateScaleFromLength,
  parseAreaToSqIn,
  parseRoomDimensions,
} from './scale';
import { pixelGraphToFloorPlan } from './toFloorPlan';
import type { FloorPlanIngestResult, GrayImage, IngestVisionResult } from './types';
import { extractWallMask } from './wallMask';
import { buildWallGraph } from './wallGraph';
import { vectorizeWalls } from './vectorize';

function gapLengthsPx(gaps: { x0: number; y0: number; x1: number; y1: number }[]): number[] {
  return gaps.map((g) => Math.hypot(g.x1 - g.x0, g.y1 - g.y0));
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function buildScaleEstimates(
  vision: IngestVisionResult | undefined,
  faces: ReturnType<typeof assignFaceMarks>,
  doorGapMedianPx: number | undefined,
  optsIpp?: number,
): ReturnType<typeof consensusScale> {
  const estimates = [];
  if (optsIpp != null && optsIpp > 0) {
    estimates.push({
      inchesPerPixel: optsIpp,
      source: 'user',
      confidence: 1,
    });
  }
  if (vision) {
    for (let i = 0; i < vision.dimensions.length; i++) {
      const dim = vision.dimensions[i]!;
      const areaSqIn = parseAreaToSqIn(dim.text);
      if (areaSqIn != null && faces.length > 0) {
        const face = faces[Math.min(i, faces.length - 1)]!;
        const xs = face.polygon.map((p) => p.x);
        const ys = face.polygon.map((p) => p.y);
        const wPx = Math.max(...xs) - Math.min(...xs);
        const dPx = Math.max(...ys) - Math.min(...ys);
        const areaPx = Math.max(1, wPx * dPx);
        estimates.push(estimateScaleFromArea(areaPx, areaSqIn));
      }
      const room = parseRoomDimensions(dim.text);
      if (room && faces.length > 0) {
        const face = faces[Math.min(i, faces.length - 1)]!;
        const xs = face.polygon.map((p) => p.x);
        const ys = face.polygon.map((p) => p.y);
        const wPx = Math.max(...xs) - Math.min(...xs);
        const dPx = Math.max(...ys) - Math.min(...ys);
        if (wPx > 0) estimates.push(estimateScaleFromLength(wPx, room.widthIn, 'room_width'));
        if (dPx > 0) estimates.push(estimateScaleFromLength(dPx, room.depthIn, 'room_depth'));
      }
    }
    for (const face of vision.faces) {
      const match = faces.find((f) => f.id === face.id) ?? faces[0];
      if (!match) continue;
      const xs = match.polygon.map((p) => p.x);
      const ys = match.polygon.map((p) => p.y);
      const wPx = Math.max(...xs) - Math.min(...xs);
      const dPx = Math.max(...ys) - Math.min(...ys);
      if (face.widthIn != null && wPx > 0) {
        estimates.push(estimateScaleFromLength(wPx, face.widthIn, `face_w:${face.id}`));
      }
      if (face.depthIn != null && dPx > 0) {
        estimates.push(estimateScaleFromLength(dPx, face.depthIn, `face_d:${face.id}`));
      }
      if (face.areaSqFt != null) {
        const areaPx = Math.max(1, wPx * dPx);
        estimates.push(estimateScaleFromArea(areaPx, face.areaSqFt * 144));
      }
    }
  }
  const consensus = consensusScale(estimates, { doorGapMedianPx });
  if (consensus.confirmed && optsIpp == null) return consensus;
  if (estimates.length === 0 && doorGapMedianPx) {
    return consensusScale([], { doorGapMedianPx });
  }
  return consensus;
}

export function ingestFloorPlanFromGray(
  gray: GrayImage,
  opts?: { vision?: IngestVisionResult; inchesPerPixel?: number },
): FloorPlanIngestResult {
  const warnings: string[] = [];
  const { wall, thin, mode } = extractWallMask(gray);
  const segments = vectorizeWalls(wall);
  if (segments.length === 0) {
    warnings.push('No wall segments detected.');
  }
  let graph = buildWallGraph(segments);
  graph = { ...graph, mode };
  graph = { ...graph, gaps: classifyGaps(graph.gaps, thin, wall) };

  const faces = assignFaceMarks(graph, wall);
  const doorGaps = graph.gaps.filter((g) => g.kindHint === 'door');
  const doorGapMedianPx = median(gapLengthsPx(doorGaps)) || undefined;
  const scale = buildScaleEstimates(opts?.vision, faces, doorGapMedianPx, opts?.inchesPerPixel);

  const { plan, uncertainWallIds, uncertainOpeningIds, faceCount } = pixelGraphToFloorPlan(
    graph,
    scale.inchesPerPixel,
    {
      vision: opts?.vision,
      height: ROOM.height,
      faceMarks: faces.map((f) => ({ id: f.id, cx: f.cx, cy: f.cy })),
    },
  );

  if (!hasEnclosedFootprint(plan)) {
    warnings.push('Plan may not form a closed room footprint.');
  }
  if (scale.provisional) {
    warnings.push('Scale is provisional; confirm with a labeled dimension.');
  }

  const marks = buildMarkList(faces, graph.gaps);

  return {
    plan,
    underlay: {
      imageWidth: gray.width,
      imageHeight: gray.height,
      originX: 0,
      originZ: 0,
      inchesPerPixel: scale.inchesPerPixel,
    },
    report: {
      mode,
      wallCount: plan.walls.length,
      openingCount: plan.openings.length,
      faceCount: Math.max(faceCount, faces.length),
      uncertainWallIds,
      uncertainOpeningIds,
      scale,
      warnings,
    },
    marks,
  };
}

export function ingestFloorPlanFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts?: { vision?: IngestVisionResult; inchesPerPixel?: number },
): FloorPlanIngestResult {
  return ingestFloorPlanFromGray(rgbaToGray(rgba, width, height), opts);
}