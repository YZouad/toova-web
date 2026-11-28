export type {
  BinaryMask,
  FloorPlanIngestResult,
  GrayImage,
  IngestReport,
  IngestVisionFace,
  IngestVisionGap,
  IngestVisionResult,
  PixelGap,
  PixelGraph,
  PixelSegment,
  ScaleConsensus,
  ScaleEstimate,
} from './types';

export {
  cloneMask,
  close,
  countOn,
  dilate,
  erode,
  histogram,
  invertMask,
  open,
  otsuThreshold,
  rgbaToGray,
  thresholdGray,
} from './raster';

export { estimateStrokeThickness, extractWallMask } from './wallMask';
export { vectorizeWalls } from './vectorize';
export { buildWallGraph } from './wallGraph';
export { classifyGaps } from './openings';
export {
  consensusScale,
  estimateScaleFromArea,
  estimateScaleFromLength,
  parseAreaToSqIn,
  parseLengthToInches,
  parseRoomDimensions,
} from './scale';
export { assignFaceMarks, buildMarkList, type FaceMark } from './marks';
export { pixelGraphToFloorPlan } from './toFloorPlan';
export { ingestFloorPlanFromGray, ingestFloorPlanFromRgba } from './ingest';
export { drawNumberedMarks, renderMarkedOverlayDataUrl } from './renderMarks';
