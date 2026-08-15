import { RoundedBox } from '@react-three/drei';
import {
  DEFAULT_PILLOW_COLOR_ID,
  DEFAULT_PILLOW_PATTERN_ID,
  PILLOW_COLORS,
  PILLOW_PATTERNS,
} from '../../lib/bedding/catalog';
import type { BeddingLayout } from '../../lib/bedding/layout';
import type { BeddingPillow } from '../../lib/bedding/types';
import { BeddingFabricMaterial } from './BeddingFabricMaterial';

interface PillowMeshProps {
  pillow: BeddingPillow;
  w: number;
  h: number;
  d: number;
  x: number;
  yCenter: number;
  z: number;
}

function PillowMesh({ pillow, w, h, d, x, yCenter, z }: PillowMeshProps) {
  const radius = Math.min(0.8, w * 0.06, h * 0.15, d * 0.05);
  const matKey = `${pillow.colorId}-${pillow.patternId}`;

  return (
    <RoundedBox
      args={[w, h, d]}
      radius={radius}
      smoothness={4}
      position={[x, yCenter, z]}
      rotation={[0, Math.PI / 2, 0]}
      castShadow
      receiveShadow
    >
      <BeddingFabricMaterial
        key={matKey}
        colors={PILLOW_COLORS}
        patterns={PILLOW_PATTERNS}
        colorId={pillow.colorId}
        patternId={pillow.patternId}
        fallbackColorId={DEFAULT_PILLOW_COLOR_ID}
        fallbackPatternId={DEFAULT_PILLOW_PATTERN_ID}
      />
    </RoundedBox>
  );
}

interface Props {
  layout: BeddingLayout;
}

export function BeddingPillows({ layout }: Props) {
  const pillows = layout.pillows;
  if (!pillows?.length) return null;

  return (
    <group>
      {pillows.map((p) => (
        <PillowMesh key={p.pillow.id} {...p} />
      ))}
    </group>
  );
}
