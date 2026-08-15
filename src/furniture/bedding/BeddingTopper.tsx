import type { BeddingLayout } from '../../lib/bedding/layout';
import { TOPPER_SKIRT } from '../../lib/bedding/layout';

const TOPPER_COLOR = '#e8e0d4';

interface Props {
  layout: BeddingLayout;
  sheetsEnabled: boolean;
}

export function BeddingTopper({ layout, sheetsEnabled }: Props) {
  const topper = layout.topper;
  if (!topper || sheetsEnabled) return null;

  const { w, d, h, yCenter } = topper;
  const skirtH = Math.min(TOPPER_SKIRT, layout.mattress.mattressH * 0.35);
  const ySkirtCenter = layout.mattress.yMattressTop - skirtH / 2;

  return (
    <group>
      <mesh position={[0, yCenter, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={TOPPER_COLOR} roughness={0.88} />
      </mesh>
      {!sheetsEnabled
        ? [
            [-w / 2 + skirtH / 2, 0],
            [w / 2 - skirtH / 2, 0],
            [0, -d / 2 + skirtH / 2],
            [0, d / 2 - skirtH / 2],
          ].map(([x, z], i) => (
            <mesh
              key={i}
              position={[x, ySkirtCenter, z]}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={[
                  i < 2 ? skirtH : w - skirtH * 2,
                  skirtH,
                  i < 2 ? d - skirtH * 2 : skirtH,
                ]}
              />
              <meshStandardMaterial color={TOPPER_COLOR} roughness={0.88} />
            </mesh>
          ))
        : null}
    </group>
  );
}
