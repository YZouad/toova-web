import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import {
  formatItemDimensions,
  itemDimLabelAnchor,
  wallDimGeometry,
  type WallDimGeometry,
} from '../lib/dimensionOverlay';
import { allWallSegments } from '../lib/floorPlanGeometry';
import { useStore } from '../store';

const DIM_COLOR = '#6b8cae';
const DIM_LINE_WIDTH = 1.25;

function WallDimRun({ geom }: { geom: WallDimGeometry }) {
  return (
    <group>
      <Line
        points={geom.startExtension}
        color={DIM_COLOR}
        lineWidth={DIM_LINE_WIDTH}
        transparent
        opacity={0.85}
      />
      <Line
        points={geom.endExtension}
        color={DIM_COLOR}
        lineWidth={DIM_LINE_WIDTH}
        transparent
        opacity={0.85}
      />
      <Line
        points={geom.dimLine}
        color={DIM_COLOR}
        lineWidth={DIM_LINE_WIDTH}
        transparent
        opacity={0.95}
      />
      <Html position={geom.labelPosition} center style={{ pointerEvents: 'none' }}>
        <div className="dg-dim-label">{geom.labelText}</div>
      </Html>
    </group>
  );
}

export function DimensionsOverlay() {
  const showDimensions = useStore((s) => s.visual.showDimensions);
  const roomGeometry = useStore((s) => s.roomGeometry);
  const order = useStore((s) => s.order);
  const items = useStore((s) => s.items);

  const wallDims = useMemo(
    () => allWallSegments(roomGeometry).map((seg) => wallDimGeometry(seg)),
    [roomGeometry],
  );

  const itemLabels = useMemo(() => {
    return order
      .map((id) => items[id])
      .filter((item): item is NonNullable<typeof item> => !!item && item.size.every((n) => n > 0))
      .map((item) => ({
        id: item.id,
        anchor: itemDimLabelAnchor(item),
        text: formatItemDimensions(item.size),
      }));
  }, [order, items]);

  if (!showDimensions) return null;

  return (
    <group>
      {wallDims.map((geom) => (
        <WallDimRun key={geom.wallId} geom={geom} />
      ))}
      {itemLabels.map(({ id, anchor, text }) => (
        <Html key={id} position={anchor} center style={{ pointerEvents: 'none' }}>
          <div className="dg-dim-label dg-dim-label--item">{text}</div>
        </Html>
      ))}
    </group>
  );
}
