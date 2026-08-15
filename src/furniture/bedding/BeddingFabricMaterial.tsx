import { useEffect } from 'react';
import { findColor, findPattern } from '../../lib/bedding/catalog';
import type { BeddingColor, BeddingPattern } from '../../lib/bedding/types';
import { useBeddingMaterial } from '../../lib/bedding/fabricTextures';

interface Props {
  colors: BeddingColor[];
  patterns: BeddingPattern[];
  colorId: string;
  patternId: string;
  fallbackColorId: string;
  fallbackPatternId: string;
  polygonOffset?: boolean;
}

export function BeddingFabricMaterial({
  colors,
  patterns,
  colorId,
  patternId,
  fallbackColorId,
  fallbackPatternId,
  polygonOffset = false,
}: Props) {
  const color = findColor(colors, colorId, fallbackColorId);
  const pattern = findPattern(patterns, patternId, fallbackPatternId);
  const material = useBeddingMaterial(color, pattern.id);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <meshStandardMaterial
      attach="material"
      map={material.map}
      color="#ffffff"
      roughness={material.roughness}
      metalness={material.metalness}
      polygonOffset={polygonOffset}
      polygonOffsetFactor={polygonOffset ? 1 : 0}
      polygonOffsetUnits={polygonOffset ? 1 : 0}
    />
  );
}
