import type { ReactNode } from 'react';
import { furnitureDrawerColor, furnitureTopColor } from '../lib/furnitureFinish';
import {
  buildForRender,
  normalizeDeskPullOut,
  normalizeDeskSidePedestal,
  resolvePullOutDims,
} from '../lib/furnitureBuild';
import type { DeskPedestalSide, DeskPullOut, FurnitureBuild } from '../lib/furnitureBuild';
import { Item } from '../store';
import { SelectionOutline } from './SelectionOutline';
import { useFurnitureFinish } from './useFurnitureFinish';
import { DrawerFaces, PullOutDrawerFace } from './cabinetGeometry';

const BODY = '#8a6440';

interface Props { item: Item; selected: boolean; invalid: boolean; }

function drawerBuildForLayout(build: FurnitureBuild, layout: DeskPedestalSide): FurnitureBuild {
  const rows = build.drawerRows ?? build.drawers ?? 3;
  const cols = build.drawerColumns ?? build.columns ?? 1;
  const total = rows * cols;
  if (layout === 'both') {
    const half = Math.max(1, Math.ceil(total / 2));
    const halfRows = Math.max(1, Math.ceil(half / cols));
    return {
      ...build,
      drawerRows: halfRows,
      drawerColumns: cols,
      drawers: halfRows * cols,
      columns: cols,
    };
  }
  return {
    ...build,
    drawerRows: rows,
    drawerColumns: cols,
    drawers: total,
    columns: cols,
  };
}

/**
 * Desk: optional side pedestals plus optional under-top pull-out drawer.
 */
export function Desk({ item, selected, invalid }: Props) {
  const [w, h, d] = item.size;
  const topT = 1.5;
  const legSize = 1.75;
  const legH = h - topT;
  const inset = 2;
  const finish = useFurnitureFinish(item, BODY);
  const topHex = furnitureTopColor('desk', item.topColor, finish.color);
  const build = buildForRender('desk', item.build);
  const sideLayout = normalizeDeskSidePedestal(build.deskPedestal);
  const pullOut = normalizeDeskPullOut(build.deskPullOut, build.deskPedestal);
  const baseStyle = build.deskBase ?? 'legs';
  const drawerHex = furnitureDrawerColor(item.drawerColor, finish.color);
  const panelT = 1.05;
  const bodyMat = (
    <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.68} />
  );

  const legMat = (
    <meshStandardMaterial color={finish.trim} map={finish.map ?? undefined} roughness={0.6} />
  );

  function leg(x: number, z: number) {
    return (
      <mesh key={`leg-${x}-${z}`} position={[x, legH / 2, z]} castShadow>
        <boxGeometry args={[legSize, legH, legSize]} />
        {legMat}
      </mesh>
    );
  }

  const usePanels = baseStyle === 'panels';
  const panelDepth = d - 0.4;
  const panelSpanW = usePanels ? w - panelT * 2 : w - 0.6;

  function sidePanel(side: -1 | 1) {
    const x = side * (w / 2 - panelT / 2);
    return (
      <mesh key={`panel-${side}`} position={[x, legH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[panelT, legH, panelDepth]} />
        {bodyMat}
      </mesh>
    );
  }

  function backPanel() {
    const z = -d / 2 + panelT / 2;
    return (
      <mesh key="panel-back" position={[0, legH / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[panelSpanW, legH, panelT]} />
        {bodyMat}
      </mesh>
    );
  }

  const legX = w / 2 - inset - legSize / 2;
  const legZFront = d / 2 - inset - legSize / 2;
  const legZBack = -d / 2 + inset + legSize / 2;

  const showBackPanel = build.deskBackPanel === true;
  const supports: ReactNode[] = [];
  if (sideLayout === 'both') {
    // Pedestals carry the top.
  } else if (sideLayout === 'left') {
    if (usePanels) supports.push(sidePanel(1));
    else supports.push(leg(legX, legZFront), leg(legX, legZBack));
  } else if (sideLayout === 'right') {
    if (usePanels) supports.push(sidePanel(-1));
    else supports.push(leg(-legX, legZFront), leg(-legX, legZBack));
  } else {
    if (usePanels) {
      supports.push(sidePanel(-1), sidePanel(1));
    } else {
      supports.push(
        leg(-legX, legZFront),
        leg(legX, legZFront),
        leg(-legX, legZBack),
        leg(legX, legZBack),
      );
    }
  }

  if (showBackPanel && sideLayout !== 'both') {
    supports.push(backPanel());
  }

  const pedW = Math.min(w * 0.24, 15);

  function sidePedestal(side: -1 | 1) {
    const x = side * (w / 2 - pedW / 2 - 0.5);
    const bodyD = d - 1;
    const pedBuild = drawerBuildForLayout(build, sideLayout);
    return (
      <group key={side} position={[x, 0, 0]}>
        <mesh position={[0, legH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[pedW, legH, bodyD]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.68} />
        </mesh>
        <DrawerFaces w={pedW} bodyH={legH} d={bodyD} build={pedBuild} finish={finish} drawerColor={drawerHex} />
      </group>
    );
  }

  function topMountedPullOutDrawer(blockW: number, blockD: number, drawerH: number, x: number, z: number) {
    const lipH = 0.35;
    const trim = finish.trim ?? finish.color;
    const desktopUnderside = legH;
    const assemblyTop = desktopUnderside - 0.12;
    const lipCenterY = assemblyTop - lipH / 2;
    const bodyTopY = assemblyTop - lipH;
    const bodyFloorY = bodyTopY - drawerH;
    const bodyCenterY = bodyFloorY + drawerH / 2;
    return (
      <group position={[x, 0, z]}>
        <mesh position={[0, lipCenterY, 0]} castShadow receiveShadow>
          <boxGeometry args={[blockW + 0.2, lipH, blockD + 0.15]} />
          <meshStandardMaterial color={trim} roughness={0.72} />
        </mesh>
        <mesh position={[0, bodyCenterY, 0]} castShadow receiveShadow>
          <boxGeometry args={[blockW, drawerH, blockD]} />
          <meshStandardMaterial color={finish.color} map={finish.map ?? undefined} roughness={0.68} />
        </mesh>
        <group position={[0, bodyFloorY, 0]}>
          <PullOutDrawerFace
            w={blockW}
            bodyH={drawerH}
            d={blockD}
            finish={finish}
            drawerColor={drawerHex}
          />
        </group>
      </group>
    );
  }

  function underTopPullOutDrawer(placement: DeskPullOut) {
    const dims = resolvePullOutDims(w, d, h, sideLayout, build);
    const blockW = dims.widthIn;
    const blockD = dims.depthIn;
    const drawerH = dims.heightIn;
    const z =
      placement === 'front'
        ? d / 2 - blockD / 2 - 0.35
        : -blockD * 0.08;
    return topMountedPullOutDrawer(blockW, blockD, drawerH, 0, z);
  }

  return (
    <group>
      {supports}
      {sideLayout === 'left' || sideLayout === 'both' ? sidePedestal(-1) : null}
      {sideLayout === 'right' || sideLayout === 'both' ? sidePedestal(1) : null}
      <mesh position={[0, legH + topT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={topHex} roughness={0.55} />
      </mesh>
      {pullOut === 'front' || pullOut === 'center' ? underTopPullOutDrawer(pullOut) : null}
      {selected && <SelectionOutline size={[w, h, d]} color={invalid ? '#ff5555' : '#4f8cff'} />}
    </group>
  );
}
