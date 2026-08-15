import { useMemo } from 'react';
import {
  COMFORTER_COLORS,
  COMFORTER_PATTERNS,
  DEFAULT_COMFORTER_COLOR_ID,
  DEFAULT_COMFORTER_PATTERN_ID,
  DEFAULT_SHEET_COLOR_ID,
  DEFAULT_SHEET_PATTERN_ID,
  SHEET_COLORS,
  SHEET_PATTERNS,
} from '../lib/bedding/catalog';
import { resolveBeddingConfig } from '../lib/bedding/config';
import { computeBeddingLayout } from '../lib/bedding/layout';
import type { Item } from '../store';
import { BeddingComforter } from './bedding/BeddingComforter';
import { BeddingPillows } from './bedding/BeddingPillows';
import { BeddingSheets } from './bedding/BeddingSheets';
import { BeddingTopper } from './bedding/BeddingTopper';

interface BedBeddingProps {
  item: Item;
  w: number;
  d: number;
  totalH: number;
  legH: number;
}

export function BedBedding({ item, w, d, totalH, legH }: BedBeddingProps) {
  const config = useMemo(
    () => resolveBeddingConfig(item),
    [item.beddingConfig, item.beddingEnabled, item.blanketColor],
  );
  const layout = useMemo(
    () => computeBeddingLayout(w, totalH, d, legH, config),
    [w, totalH, d, legH, config],
  );

  const hasAnyLayer =
    config.topper.enabled ||
    config.sheets.enabled ||
    config.comforter.enabled ||
    (config.pillows.enabled && config.pillows.items.length > 0);

  if (!hasAnyLayer) return null;

  return (
    <group>
      {config.topper.enabled ? (
        <BeddingTopper layout={layout} sheetsEnabled={config.sheets.enabled} />
      ) : null}
      {config.sheets.enabled ? (
        <BeddingSheets
          layout={layout}
          colors={SHEET_COLORS}
          patterns={SHEET_PATTERNS}
          colorId={config.sheets.colorId}
          patternId={config.sheets.patternId}
          fallbackColorId={DEFAULT_SHEET_COLOR_ID}
          fallbackPatternId={DEFAULT_SHEET_PATTERN_ID}
        />
      ) : null}
      {config.comforter.enabled ? (
        <BeddingComforter
          layout={layout}
          colors={COMFORTER_COLORS}
          patterns={COMFORTER_PATTERNS}
          colorId={config.comforter.colorId}
          patternId={config.comforter.patternId}
          fallbackColorId={DEFAULT_COMFORTER_COLOR_ID}
          fallbackPatternId={DEFAULT_COMFORTER_PATTERN_ID}
        />
      ) : null}
      {config.pillows.enabled ? <BeddingPillows layout={layout} /> : null}
    </group>
  );
}

export function beddingSelectionExtraHeight(item: Item, w: number, d: number, totalH: number, legH: number): number {
  const config = resolveBeddingConfig(item);
  const layout = computeBeddingLayout(w, totalH, d, legH, config);
  return layout.selectionExtraH;
}
