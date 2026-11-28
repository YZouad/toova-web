export interface GrayImage {
  width: number;
  height: number;
  /** 0..255 luminance, row-major. */
  data: Uint8Array;
}

export interface BinaryMask {
  width: number;
  height: number;
  /** 0 or 1 per pixel. */
  data: Uint8Array;
}

export interface PixelSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  thickness?: number;
  confidence?: number;
}

export interface PixelGap {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kindHint?: 'door' | 'window' | 'opening' | 'unknown';
  hinge?: 'left' | 'right';
  confidence?: number;
}

export interface PixelGraph {
  segments: PixelSegment[];
  gaps: PixelGap[];
  /** Axis-aligned lines used (x=const or y=const). */
  mode: 'solid' | 'hollow';
}

export interface ScaleEstimate {
  inchesPerPixel: number;
  source: string;
  confidence: number;
}

export interface ScaleConsensus {
  inchesPerPixel: number;
  estimates: ScaleEstimate[];
  /** true when >=2 estimates agree within 5%, or user confirmed. */
  confirmed: boolean;
  provisional: boolean;
}

export interface IngestVisionFace {
  id: string;
  label?: string;
  tag?: string;
  interior?: boolean;
  widthIn?: number;
  depthIn?: number;
  areaSqFt?: number;
}

export interface IngestVisionGap {
  id: string;
  kind: 'door' | 'window' | 'opening' | 'none';
}

export interface IngestVisionResult {
  faces: IngestVisionFace[];
  gaps: IngestVisionGap[];
  dimensions: { text: string; inches?: number }[];
  units?: 'imperial' | 'metric';
}

export interface IngestReport {
  mode: 'solid' | 'hollow';
  wallCount: number;
  openingCount: number;
  faceCount: number;
  uncertainWallIds: string[];
  uncertainOpeningIds: string[];
  scale: ScaleConsensus;
  warnings: string[];
}

export interface FloorPlanIngestResult {
  plan: import('../floorPlanGeometry').FloorPlan;
  underlay: {
    imageWidth: number;
    imageHeight: number;
    originX: number;
    originZ: number;
    inchesPerPixel: number;
  };
  report: IngestReport;
  /** Numbered faces/gaps for vision (optional). */
  marks?: { faces: { id: string; cx: number; cy: number }[]; gaps: { id: string; cx: number; cy: number }[] };
}