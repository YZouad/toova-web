import { Html } from '@react-three/drei';
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../store';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';

const ARC_VERTICAL_OFFSET = 16;
const SCALE_STEP = 1.12;

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

  const anchor: [number, number, number] = [
    item.position[0],
    item.position[1] + item.size[1] + ARC_VERTICAL_OFFSET,
    item.position[2],
  ];

  const scaleBy = (factor: number) => {
    const curMax = Math.max(item.size[0], item.size[1], item.size[2]);
    setItemSize(item.id, proportionalSizesFromMaxSide(item.size, curMax * factor));
  };

  const buttons: ArcButton[] = [
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

  const angles = [-104, -62, -21, 21, 62, 104];
  const radius = 88;

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

function arcBtnTransform(deg: number, radius: number): CSSProperties {
  return {
    transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${radius}px) rotate(${-deg}deg)`,
  };
}
