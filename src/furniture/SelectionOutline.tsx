import { useMemo } from 'react';
import * as THREE from 'three';

interface Props {
  // Bounding box dimensions, centered at (0, y/2, 0)
  size: [number, number, number];
  // Top-Y of the box; default uses size[1] (box from 0..h)
  baseY?: number;
  color?: string;
}

/**
 * Renders a wireframe box outline. Origin convention: box sits on Y=baseY with
 * dimensions size, centered in XZ.
 */
export function SelectionOutline({ size, baseY = 0, color = '#4f8cff' }: Props) {
  const [w, h, d] = size;
  const geom = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), [w, h, d]);
  return (
    <lineSegments position={[0, baseY + h / 2, 0]} geometry={geom}>
      <lineBasicMaterial color={color} linewidth={2} />
    </lineSegments>
  );
}
