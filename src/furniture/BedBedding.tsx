import { useTexture } from '@react-three/drei';
import { Suspense } from 'react';
import type { Texture } from 'three';
import { DEFAULT_BLANKET_COLOR, type Item } from '../store';

const PILLOW_COLOR = '#f5f2eb';

function BlanketTextured({
  blanketColor,
  textureUrl,
}: {
  blanketColor: string;
  textureUrl: string;
}) {
  const map = useTexture(textureUrl) as Texture;
  return (
    <meshStandardMaterial map={map} color={blanketColor} roughness={0.92} />
  );
}

interface BedBeddingProps {
  item: Item;
  w: number;
  d: number;
  yMattressMid: number;
  mattressH: number;
}

/** Procedural blanket + twin pillows when bedding is enabled on a bed. */
export function BedBedding({ item, w, d, yMattressMid, mattressH }: BedBeddingProps) {
  if (!item.beddingEnabled) return null;

  const blanketColor = item.blanketColor ?? DEFAULT_BLANKET_COLOR;
  const blanketW = Math.max(4, w - 6);
  const blanketH = 3;
  const blanketD = Math.max(4, d - 10);
  const zBlanket = 4;
  const yBlanketCenter = yMattressMid + mattressH / 2 + blanketH / 2;

  const pillowW = Math.min(16, (w - 10) / 2);
  const pillowH = 5;
  const pillowD = 12;
  const yPillowCenter = yMattressMid + mattressH / 2 + pillowH / 2;
  const zPillow = -d / 2 + pillowD / 2 + 2;
  const pillowGap = 2;
  const xOff = pillowW / 2 + pillowGap / 2;

  return (
    <group>
      <mesh position={[0, yBlanketCenter, zBlanket]} castShadow receiveShadow>
        <boxGeometry args={[blanketW, blanketH, blanketD]} />
        {item.blanketTextureUrl ? (
          <Suspense fallback={<meshStandardMaterial color={blanketColor} roughness={0.92} />}>
            <BlanketTextured
              blanketColor={blanketColor}
              textureUrl={item.blanketTextureUrl}
            />
          </Suspense>
        ) : (
          <meshStandardMaterial color={blanketColor} roughness={0.92} />
        )}
      </mesh>

      <mesh position={[-xOff, yPillowCenter, zPillow]} castShadow receiveShadow>
        <boxGeometry args={[pillowW, pillowH, pillowD]} />
        <meshStandardMaterial color={PILLOW_COLOR} roughness={0.94} />
      </mesh>
      <mesh position={[xOff, yPillowCenter, zPillow]} castShadow receiveShadow>
        <boxGeometry args={[pillowW, pillowH, pillowD]} />
        <meshStandardMaterial color={PILLOW_COLOR} roughness={0.94} />
      </mesh>
    </group>
  );
}
