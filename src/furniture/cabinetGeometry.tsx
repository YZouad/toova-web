import * as THREE from 'three';
import type { FurnitureBuild } from '../lib/furnitureBuild';

const ACCENT = '#3a2e22';

export type DrawerLayoutCell = {
  cx: number;
  cy: number;
  faceW: number;
  faceH: number;
};

export function layoutDrawerGrid(
  rows: number,
  columns: number,
  bodyW: number,
  bodyH: number,
  heights?: number[],
): DrawerLayoutCell[] {
  const rowCount = Math.max(1, rows);
  const colCount = Math.max(1, columns);
  const padX = 1;
  const padY = 1.1;
  const innerW = Math.max(1, bodyW - padX * 2);
  const innerH = Math.max(1, bodyH - padY * 2);
  const colW = innerW / colCount;
  const weights =
    heights && heights.length >= rowCount
      ? heights.slice(0, rowCount)
      : Array.from({ length: rowCount }, () => 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const cells: DrawerLayoutCell[] = [];
  let yCursor = padY;
  for (let row = 0; row < rowCount; row++) {
    const rowH = (weights[row]! / weightSum) * innerH;
    for (let col = 0; col < colCount; col++) {
      const cx = -innerW / 2 + colW * (col + 0.5);
      const cy = yCursor + rowH / 2;
      cells.push({
        cx,
        cy,
        faceW: Math.max(0.5, colW - 0.55),
        faceH: Math.max(0.5, rowH - 0.5),
      });
    }
    yCursor += rowH;
  }
  return cells;
}

type FinishProps = {
  color: string;
  map?: THREE.Texture | null;
  trim?: string;
};

/** One drawer face spanning the full width (desk pencil drawer). */
export function PullOutDrawerFace({
  w,
  bodyH,
  d,
  finish,
  drawerColor,
}: {
  w: number;
  bodyH: number;
  d: number;
  finish: FinishProps;
  drawerColor: string;
}) {
  const dz = d / 2 + 0.05;
  const handleZ = d / 2 + 0.4;
  const faceW = Math.max(1, w - 1.1);
  const faceH = Math.max(0.5, bodyH - 0.55);
  const cy = bodyH / 2;
  const customDrawerTint = drawerColor.toLowerCase() !== finish.color.toLowerCase();
  const faceMap = customDrawerTint ? undefined : finish.map ?? undefined;
  return (
    <>
      <mesh position={[0, cy, dz]} castShadow>
        <boxGeometry args={[faceW, faceH, 0.5]} />
        <meshStandardMaterial color={drawerColor} map={faceMap} roughness={0.7} />
      </mesh>
      <mesh position={[0, cy, handleZ]} castShadow>
        <boxGeometry args={[Math.min(10, faceW * 0.22), 0.6, 0.6]} />
        <meshStandardMaterial color={ACCENT} roughness={0.5} metalness={0.2} />
      </mesh>
    </>
  );
}

export function DrawerFaces({
  w,
  bodyH,
  d,
  build,
  finish,
  drawerColor,
}: {
  w: number;
  bodyH: number;
  d: number;
  build: FurnitureBuild;
  finish: FinishProps;
  drawerColor: string;
}) {
  const cols = build.drawerColumns ?? build.columns ?? 1;
  const rows = build.drawerRows ?? (build.drawers != null && cols > 0 ? Math.ceil(build.drawers / cols) : undefined) ?? 3;
  const cells = layoutDrawerGrid(rows, cols, w, bodyH, build.heights);
  const dz = d / 2 + 0.05;
  const handleZ = d / 2 + 0.4;
  const customDrawerTint = drawerColor.toLowerCase() !== finish.color.toLowerCase();
  const faceMap = customDrawerTint ? undefined : finish.map ?? undefined;
  const padX = 1;
  const innerW = Math.max(1, w - padX * 2);
  const colW = innerW / Math.max(1, cols);
  const trim = finish.trim ?? finish.color;

  const colDividers =
    cols > 1
      ? Array.from({ length: cols - 1 }, (_, i) => {
          const x = -innerW / 2 + colW * (i + 1);
          return (
            <mesh key={`col-${i}`} position={[x, bodyH / 2, dz + 0.02]} castShadow>
              <boxGeometry args={[0.35, bodyH - 2, 0.4]} />
              <meshStandardMaterial color={trim} roughness={0.75} />
            </mesh>
          );
        })
      : null;

  return (
    <>
      {colDividers}
      {cells.map((cell, i) => (
        <group key={i}>
          <mesh position={[cell.cx, cell.cy, dz]} castShadow>
            <boxGeometry args={[cell.faceW, cell.faceH, 0.5]} />
            <meshStandardMaterial color={drawerColor} map={faceMap} roughness={0.7} />
          </mesh>
          <mesh position={[cell.cx, cell.cy, handleZ]} castShadow>
            <boxGeometry args={[Math.min(6, cell.faceW * 0.35), 0.6, 0.6]} />
            <meshStandardMaterial color={ACCENT} roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
      ))}
    </>
  );
}
