import { PILLOW_SIZES } from './catalog';
import type { BeddingConfig, BeddingPillow } from './types';

export const TOPPER_HEIGHT = 2;
export const COMFORTER_THICKNESS = 2.2;
export const COMFORTER_OVERHANG_SIDE = 4;
export const COMFORTER_OVERHANG_FOOT = 4;
export const COMFORTER_SKIRT_DROP = 3.5;
export const DEFAULT_COMFORTER_DRAPE_INCHES = 6;
export const MIN_COMFORTER_DRAPE_INCHES = 3;
export const MAX_COMFORTER_DRAPE_INCHES = 14;
export const COMFORTER_SKIRT_THICKNESS = 0.25;
export const SHEET_THICKNESS = 0.35;
export const TOPPER_WRAP = 0.4;
export const TOPPER_SKIRT = 1;

export interface MattressLayout {
  mattressW: number;
  mattressD: number;
  mattressH: number;
  yMattressMid: number;
  yMattressTop: number;
}

export interface ComforterSkirtLayout {
  w: number;
  h: number;
  d: number;
  x: number;
  yCenter: number;
  z: number;
}

export interface ComforterLayout {
  top: {
    w: number;
    d: number;
    h: number;
    yCenter: number;
    zCenter: number;
  };
  skirts: ComforterSkirtLayout[];
}

export interface BeddingLayout {
  mattress: MattressLayout;
  sleepStackH: number;
  ySleepTop: number;
  topper?: {
    w: number;
    d: number;
    h: number;
    yCenter: number;
  };
  sheets?: {
    stackH: number;
    yTopCenter: number;
    ySideCenter: number;
    w: number;
    d: number;
  };
  comforter?: ComforterLayout;
  pillows?: Array<{
    pillow: BeddingPillow;
    w: number;
    h: number;
    d: number;
    x: number;
    yCenter: number;
    z: number;
  }>;
  selectionExtraH: number;
}

export function computeMattressLayoutFromBed(
  w: number,
  totalH: number,
  d: number,
  legH: number,
): MattressLayout {
  const bodyH = Math.max(4, totalH - legH);
  const frameH = Math.min(6, Math.max(1.5, bodyH * 0.4));
  const mattressH = Math.max(1, bodyH - frameH);
  const yMattressMid = legH + frameH + mattressH / 2;
  const yMattressTop = legH + frameH + mattressH;
  return {
    mattressW: w - 2,
    mattressD: d - 2,
    mattressH,
    yMattressMid,
    yMattressTop,
  };
}

function computeComforterLayout(
  mattressW: number,
  mattressD: number,
  yComforterBase: number,
  drapeInches: number,
): ComforterLayout {
  const skirtDrop = Math.min(
    MAX_COMFORTER_DRAPE_INCHES,
    Math.max(MIN_COMFORTER_DRAPE_INCHES, drapeInches),
  );
  const comforterW = mattressW + COMFORTER_OVERHANG_SIDE * 2;
  const comforterD = mattressD + COMFORTER_OVERHANG_FOOT;
  const zCenter = COMFORTER_OVERHANG_FOOT / 2;
  const yTopCenter = yComforterBase + COMFORTER_THICKNESS / 2;
  const ySkirtCenter = yComforterBase - skirtDrop / 2;
  const skirtT = COMFORTER_SKIRT_THICKNESS;
  const skirtInnerD = comforterD - skirtT * 2;

  return {
    top: {
      w: comforterW,
      d: comforterD,
      h: COMFORTER_THICKNESS,
      yCenter: yTopCenter,
      zCenter,
    },
    skirts: [
      {
        w: skirtT,
        h: skirtDrop,
        d: skirtInnerD,
        x: -comforterW / 2 + skirtT / 2,
        yCenter: ySkirtCenter,
        z: zCenter,
      },
      {
        w: skirtT,
        h: skirtDrop,
        d: skirtInnerD,
        x: comforterW / 2 - skirtT / 2,
        yCenter: ySkirtCenter,
        z: zCenter,
      },
      {
        w: comforterW - skirtT * 2,
        h: skirtDrop,
        d: skirtT,
        x: 0,
        yCenter: ySkirtCenter,
        z: zCenter + comforterD / 2 - skirtT / 2,
      },
    ],
  };
}

export function computeBeddingLayout(
  w: number,
  totalH: number,
  d: number,
  legH: number,
  config: BeddingConfig,
): BeddingLayout {
  const mattress = computeMattressLayoutFromBed(w, totalH, d, legH);
  const { mattressW, mattressD, mattressH, yMattressTop } = mattress;

  const topperEnabled = config.topper.enabled;
  const sleepStackH = mattressH + (topperEnabled ? TOPPER_HEIGHT : 0);
  const ySleepTop = yMattressTop + (topperEnabled ? TOPPER_HEIGHT : 0);
  const sheetFootprintW = topperEnabled ? mattressW + TOPPER_WRAP : mattressW + 0.2;
  const sheetFootprintD = topperEnabled ? mattressD + TOPPER_WRAP : mattressD + 0.2;

  let selectionExtraH = 0;
  const layout: BeddingLayout = {
    mattress,
    sleepStackH,
    ySleepTop,
    selectionExtraH: 0,
  };

  if (topperEnabled) {
    layout.topper = {
      w: sheetFootprintW,
      d: sheetFootprintD,
      h: TOPPER_HEIGHT,
      yCenter: yMattressTop + TOPPER_HEIGHT / 2,
    };
    selectionExtraH = Math.max(selectionExtraH, TOPPER_HEIGHT);
  }

  if (config.sheets.enabled) {
    const stackH = sleepStackH;
    layout.sheets = {
      stackH,
      yTopCenter: ySleepTop + SHEET_THICKNESS / 2,
      ySideCenter: yMattressTop - mattressH + stackH / 2,
      w: sheetFootprintW,
      d: sheetFootprintD,
    };
    selectionExtraH = Math.max(selectionExtraH, SHEET_THICKNESS);
  }

  let yComforterBase = ySleepTop + (config.sheets.enabled ? SHEET_THICKNESS : 0);

  if (config.comforter.enabled) {
    const drapeInches = config.comforter.drapeInches ?? DEFAULT_COMFORTER_DRAPE_INCHES;
    layout.comforter = computeComforterLayout(mattressW, mattressD, yComforterBase, drapeInches);
    const skirtDrop = Math.min(
      MAX_COMFORTER_DRAPE_INCHES,
      Math.max(MIN_COMFORTER_DRAPE_INCHES, drapeInches),
    );
    selectionExtraH = Math.max(
      selectionExtraH,
      yComforterBase + COMFORTER_THICKNESS - yMattressTop,
      skirtDrop,
    );
  }

  const yPillowBase =
    yComforterBase +
    (config.comforter.enabled ? COMFORTER_THICKNESS : 0) +
    (config.sheets.enabled && !config.comforter.enabled ? SHEET_THICKNESS : 0);

  if (config.pillows.enabled && config.pillows.items.length > 0) {
    const items = config.pillows.items;
    const specs = items.map((pillow) => {
      const size = PILLOW_SIZES[pillow.size];
      return {
        pillow,
        w: Math.min(size.width, mattressW - 2),
        h: size.height,
        d: size.depth,
      };
    });
    const totalWidth =
      specs.reduce((sum, s) => sum + s.w, 0) + Math.max(0, specs.length - 1) * 1.5;
    let xCursor = -totalWidth / 2;
    layout.pillows = specs.map((spec) => {
      let x = xCursor + spec.w / 2;
      xCursor += spec.w + 1.5;
      let z = -mattressD / 2 + spec.d / 2 + 1.5;
      x += spec.pillow.offsetX ?? 0;
      z += spec.pillow.offsetZ ?? 0;
      const halfExtentX = spec.d / 2;
      const halfExtentZ = spec.w / 2;
      x = Math.min(mattressW / 2 - halfExtentX, Math.max(-mattressW / 2 + halfExtentX, x));
      z = Math.min(mattressD / 2 - halfExtentZ, Math.max(-mattressD / 2 + halfExtentZ, z));
      return {
        ...spec,
        x,
        yCenter: yPillowBase + spec.h / 2,
        z,
      };
    });
    const maxPillowH = Math.max(...layout.pillows.map((p) => p.h));
    selectionExtraH = Math.max(selectionExtraH, yPillowBase + maxPillowH - yMattressTop);
  }

  layout.selectionExtraH = selectionExtraH;
  return layout;
}
