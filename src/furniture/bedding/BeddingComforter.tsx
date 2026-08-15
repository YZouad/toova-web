import type { ComponentProps } from 'react';
import type { BeddingColor, BeddingPattern } from '../../lib/bedding/types';
import type { BeddingLayout } from '../../lib/bedding/layout';
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

function ComforterMesh({
  w,
  h,
  d,
  x,
  y,
  z,
  matKey,
  matProps,
}: {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  matKey: string;
  matProps: Omit<ComponentProps<typeof BeddingFabricMaterial>, 'polygonOffset'>;
}) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <BeddingFabricMaterial key={matKey} {...matProps} />
    </mesh>
  );
}

export function BeddingComforter({
  layout,
  colors,
  patterns,
  colorId,
  patternId,
  fallbackColorId,
  fallbackPatternId,
}: Props) {
  const comforter = layout.comforter;
  if (!comforter) return null;

  const { top, skirts } = comforter;
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
      <ComforterMesh
        w={top.w}
        h={top.h}
        d={top.d}
        x={0}
        y={top.yCenter}
        z={top.zCenter}
        matKey={`top-${matKey}`}
        matProps={matProps}
      />
      {skirts.map((skirt, i) => (
        <ComforterMesh
          key={i}
          w={skirt.w}
          h={skirt.h}
          d={skirt.d}
          x={skirt.x}
          y={skirt.yCenter}
          z={skirt.z}
          matKey={`skirt-${i}-${matKey}`}
          matProps={matProps}
        />
      ))}
    </group>
  );
}
