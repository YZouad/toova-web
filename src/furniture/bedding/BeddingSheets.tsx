import type { BeddingColor, BeddingPattern } from '../../lib/bedding/types';
import type { BeddingLayout } from '../../lib/bedding/layout';
import { SHEET_THICKNESS } from '../../lib/bedding/layout';
import { BeddingFabricMaterial } from './BeddingFabricMaterial';

interface Props {
  layout: BeddingLayout;
  colors: BeddingColor[];
  patterns: BeddingPattern[];
  colorId: string;
  patternId: string;
  fallbackColorId: string;
  fallbackPatternId: string;
}

export function BeddingSheets({
  layout,
  colors,
  patterns,
  colorId,
  patternId,
  fallbackColorId,
  fallbackPatternId,
}: Props) {
  const sheets = layout.sheets;
  if (!sheets) return null;

  const { w, d, stackH, yTopCenter, ySideCenter } = sheets;
  const matKey = `${colorId}-${patternId}`;
  const matProps = {
    colors,
    patterns,
    colorId,
    patternId,
    fallbackColorId,
    fallbackPatternId,
  };

  return (
    <group>
      <mesh position={[0, yTopCenter, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, SHEET_THICKNESS, d]} />
        <BeddingFabricMaterial key={`top-${matKey}`} {...matProps} polygonOffset />
      </mesh>
      <mesh position={[0, ySideCenter, -d / 2 + SHEET_THICKNESS / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, stackH, SHEET_THICKNESS]} />
        <BeddingFabricMaterial key={`head-${matKey}`} {...matProps} polygonOffset />
      </mesh>
      <mesh position={[0, ySideCenter, d / 2 - SHEET_THICKNESS / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, stackH, SHEET_THICKNESS]} />
        <BeddingFabricMaterial key={`foot-${matKey}`} {...matProps} polygonOffset />
      </mesh>
      <mesh position={[-w / 2 + SHEET_THICKNESS / 2, ySideCenter, 0]} castShadow receiveShadow>
        <boxGeometry args={[SHEET_THICKNESS, stackH, d - SHEET_THICKNESS * 2]} />
        <BeddingFabricMaterial key={`left-${matKey}`} {...matProps} polygonOffset />
      </mesh>
      <mesh position={[w / 2 - SHEET_THICKNESS / 2, ySideCenter, 0]} castShadow receiveShadow>
        <boxGeometry args={[SHEET_THICKNESS, stackH, d - SHEET_THICKNESS * 2]} />
        <BeddingFabricMaterial key={`right-${matKey}`} {...matProps} polygonOffset />
      </mesh>
    </group>
  );
}
