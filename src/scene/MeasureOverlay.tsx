import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { formatLength } from '../lib/floorPlanGeometry';
import { activeMeasureEndpoint } from '../lib/measureDraftState';
import { formatMeasureReadout, type MeasureVec3 } from '../lib/measureDistance';
import { measureEndpointLabel } from '../lib/measureInstruction';
import { useStore } from '../store';
import { HeightArrow } from './HeightArrow';

const MEASURE_COLOR = '#e8a84a';
const MEASURE_COLOR_HOT = '#ffb347';
const BULB_RADIUS = 0.9;

function midpoint(a: MeasureVec3, b: MeasureVec3): MeasureVec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function MeasureHandle({
  position,
  selected,
  dragging,
}: {
  position: MeasureVec3;
  selected: boolean;
  dragging: boolean;
}) {
  const r = selected || dragging ? BULB_RADIUS * 1.12 : BULB_RADIUS;
  const color = selected || dragging ? MEASURE_COLOR_HOT : MEASURE_COLOR;

  return (
    <group position={position}>
      {selected ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r + 0.35, 0.08, 8, 24]} />
          <meshStandardMaterial
            color={MEASURE_COLOR_HOT}
            emissive={MEASURE_COLOR_HOT}
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      <mesh>
        <sphereGeometry args={[r, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || dragging ? 0.85 : 0.45}
          roughness={0.4}
          metalness={0.05}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function MeasureOverlay() {
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null;
  const draft = useStore((s) => s.measureDraft);
  const acceptField = useStore((s) => s.measureDraft?.acceptField ?? null);
  const activeEndpoint = useStore((s) => s.measureDraft?.activeEndpoint ?? null);
  const draggingEndpoint = useStore((s) => s.measureDraft?.draggingEndpoint ?? null);
  const active = useStore((s) => s.designerTool === 'measure');
  const roomHeight = useStore((s) => s.roomGeometry.height);
  const setMeasureEndpoint = useStore((s) => s.setMeasureEndpoint);

  if (!active || !draft) return null;

  const readout = formatMeasureReadout(
    draft.a,
    draft.b,
    (inches) => formatLength(inches, 'ft-in'),
    acceptField,
  );
  const labelPos = midpoint(draft.a, draft.b);
  const activePoint = activeMeasureEndpoint(draft);

  return (
    <group>
      <MeasureHandle
        position={draft.a}
        selected={activeEndpoint === 'a'}
        dragging={draggingEndpoint === 'a'}
      />
      <MeasureHandle
        position={draft.b}
        selected={activeEndpoint === 'b'}
        dragging={draggingEndpoint === 'b'}
      />

      {activePoint && activeEndpoint ? (
        <>
          <HeightArrow
            position={[activePoint[0], activePoint[1] + 2, activePoint[2]]}
            baseY={activePoint[1]}
            length={12}
            color={MEASURE_COLOR}
            colorHot={MEASURE_COLOR_HOT}
            onLift={(y) => {
              const clamped = Math.max(0, Math.min(roomHeight, y));
              setMeasureEndpoint(activeEndpoint, [
                activePoint[0],
                clamped,
                activePoint[2],
              ]);
            }}
            onDragStart={() => {
              if (controls) controls.enabled = false;
            }}
            onDragEnd={() => {
              if (controls) controls.enabled = true;
            }}
          />
          <Html position={activePoint} center style={{ pointerEvents: 'none' }}>
            <div className="dg-measure-snap-label">
              {measureEndpointLabel(activeEndpoint)}
            </div>
          </Html>
        </>
      ) : null}

      <Line
        points={[draft.a, draft.b]}
        color={MEASURE_COLOR}
        lineWidth={1.5}
        transparent
        opacity={0.75}
      />

      <Html position={labelPos} center style={{ pointerEvents: 'none' }}>
        <div className="dg-measure-label">
          <div className="dg-measure-label__primary">{readout.primary}</div>
          {readout.secondary ? (
            <div className="dg-measure-label__secondary">{readout.secondary}</div>
          ) : null}
        </div>
      </Html>
    </group>
  );
}
