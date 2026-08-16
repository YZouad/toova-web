import { Html } from '@react-three/drei';
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../store';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';

const SCALE_STEP = 1.12;
/** Screen-space button diameter used when sizing the arc (matches CSS). */
const ARC_BTN_PX = 44;
const ARC_BTN_GAP_PX = 10;
/** Arc span in degrees for distributing buttons. */
const ARC_SPAN_DEG = 200;
const ARC_RADIUS_MIN = 48;
const ARC_RADIUS_MAX = 112;
/** World-space lift above object center (inches). */
const ARC_LIFT_MIN = 3;
const ARC_LIFT_MAX = 20;

interface ArcButton {
  key: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/** Radial menu above the selected item — rotate, scale, wall, duplicate, delete. */
export function ArcMenu() {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (s.selectedId ? s.items[s.selectedId] : null));

  const updateRotation = useStore((s) => s.updateRotation);
  const setItemSize = useStore((s) => s.setItemSize);
  const setWallMounted = useStore((s) => s.setWallMounted);
  const duplicateItem = useStore((s) => s.duplicateItem);
  const removeItem = useStore((s) => s.removeItem);

  if (!selectedId || !item) return null;

  const maxDim = Math.max(item.size[0], item.size[1], item.size[2]);
  // Lift from object center scales with size, then caps so large pieces don't float the menu away.
  const lift = Math.min(ARC_LIFT_MAX, Math.max(ARC_LIFT_MIN, maxDim * 0.55 + 2.5));
  const anchor: [number, number, number] = [
    item.position[0],
    item.position[1] + item.size[1] / 2 + lift,
    item.position[2],
  ];

  const scaleBy = (factor: number) => {
    const curMax = Math.max(item.size[0], item.size[1], item.size[2]);
    setItemSize(item.id, proportionalSizesFromMaxSide(item.size, curMax * factor));
  };

  const buttons: ArcButton[] =
    item.kind === 'hanging' || item.kind === 'light'
      ? [
          {
            key: 'duplicate',
            title: 'Duplicate',
            icon: '⧉',
            onClick: () => duplicateItem(item.id),
          },
          {
            key: 'delete',
            title: 'Delete',
            icon: '✕',
            onClick: () => removeItem(item.id),
            danger: true,
          },
        ]
      : [
          {
            key: 'rotate',
            title: 'Rotate 45°',
            icon: '↻',
            onClick: () => updateRotation(item.id, item.rotationY + Math.PI / 4),
          },
          {
            key: 'smaller',
            title: 'Smaller',
            icon: '–',
            onClick: () => scaleBy(1 / SCALE_STEP),
          },
          {
            key: 'bigger',
            title: 'Bigger',
            icon: '＋',
            onClick: () => scaleBy(SCALE_STEP),
          },
          {
            key: 'wall',
            title: item.wallMounted ? 'Unmount from wall' : 'Wall mount',
            icon: '▦',
            onClick: () => setWallMounted(item.id, !item.wallMounted),
          },
          {
            key: 'duplicate',
            title: 'Duplicate',
            icon: '⧉',
            onClick: () => duplicateItem(item.id),
          },
          {
            key: 'delete',
            title: 'Delete',
            icon: '✕',
            onClick: () => removeItem(item.id),
            danger: true,
          },
        ];

  const angles = arcAngles(buttons.length, ARC_SPAN_DEG);
  const radius = arcRadiusForCount(buttons.length, ARC_SPAN_DEG);

  return (
    <Html
      position={anchor}
      center
      zIndexRange={[60, 0]}
      style={{ pointerEvents: 'none' }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        className="arc-menu"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {buttons.map((b, i) => {
          const deg = angles[i] ?? 0;
          return (
            <button
              key={b.key}
              type="button"
              title={b.title}
              aria-label={b.title}
              className={`arc-menu-btn${b.danger ? ' arc-menu-btn--danger' : ''}`}
              style={arcBtnTransform(deg, radius)}
              onClick={(e) => {
                e.stopPropagation();
                b.onClick();
              }}
            >
              {b.icon}
            </button>
          );
        })}
      </div>
    </Html>
  );
}

function arcAngles(count: number, spanDeg: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const start = -spanDeg / 2;
  const step = spanDeg / (count - 1);
  return Array.from({ length: count }, (_, i) => start + step * i);
}

/** Smallest radius that keeps buttons from overlapping, clamped to a usable range. */
function arcRadiusForCount(count: number, spanDeg: number): number {
  if (count <= 1) return ARC_RADIUS_MIN;
  const stepDeg = spanDeg / (count - 1);
  const minChord = ARC_BTN_PX + ARC_BTN_GAP_PX;
  const needed = minChord / (2 * Math.sin((stepDeg * Math.PI) / 360));
  return Math.min(ARC_RADIUS_MAX, Math.max(ARC_RADIUS_MIN, needed));
}

function arcBtnTransform(deg: number, radius: number): CSSProperties {
  return {
    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${radius}px) rotate(${-deg}deg)`,
  };
}
