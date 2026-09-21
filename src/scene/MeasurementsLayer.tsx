import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { formatLength } from '../lib/floorPlanGeometry';
import { formatMeasureReadout, type MeasureVec3 } from '../lib/measureDistance';
import type { MeasureHit } from '../lib/measurePick';
import { useStore, type Measurement } from '../store';

const MEASURE_COLOR = '#e8a84a';
const MEASURE_COLOR_HOT = '#ffb347';
const DOT_RADIUS = 0.55;
const RETICLE_RADIUS = 1.4;

function midpoint(a: MeasureVec3, b: MeasureVec3): MeasureVec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function MeasureDot({ position, hot = false }: { position: MeasureVec3; hot?: boolean }) {
  const color = hot ? MEASURE_COLOR_HOT : MEASURE_COLOR;
  return (
    <mesh position={position} userData={{ measureGizmo: true }}>
      <sphereGeometry args={[DOT_RADIUS, 12, 10]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={hot ? 0.9 : 0.5}
        roughness={0.4}
        metalness={0.05}
        toneMapped={false}
      />
    </mesh>
  );
}

function MeasureReadoutLabel({
  a,
  b,
  onRemove,
}: {
  a: MeasureVec3;
  b: MeasureVec3;
  onRemove?: () => void;
}) {
  const acceptField = useStore((s) => s.measureImportField);
  const readout = formatMeasureReadout(
    a,
    b,
    (inches) => formatLength(inches, 'ft-in'),
    acceptField,
  );
  const pos = midpoint(a, b);

  return (
    <Html position={pos} center style={{ pointerEvents: onRemove ? 'auto' : 'none' }}>
      <div className="dg-measure-label">
        <div className="dg-measure-label__row">
          <div className="dg-measure-label__primary">{readout.primary}</div>
          {onRemove ? (
            <button
              type="button"
              className="dg-measure-label__remove"
              aria-label="Remove measurement"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        {readout.secondary ? (
          <div className="dg-measure-label__secondary">{readout.secondary}</div>
        ) : null}
      </div>
    </Html>
  );
}

function CommittedMeasurement({
  measurement,
}: {
  measurement: Measurement;
}) {
  const removeMeasurement = useStore((s) => s.removeMeasurement);
  return (
    <group userData={{ measureGizmo: true }}>
      <MeasureDot position={measurement.a} />
      <MeasureDot position={measurement.b} />
      <Line
        points={[measurement.a, measurement.b]}
        color={MEASURE_COLOR}
        lineWidth={1.5}
        transparent
        opacity={0.8}
        userData={{ measureGizmo: true }}
      />
      <MeasureReadoutLabel
        a={measurement.a}
        b={measurement.b}
        onRemove={() => removeMeasurement(measurement.id)}
      />
    </group>
  );
}

function Reticle({ hit }: { hit: MeasureHit }) {
  const quat = useMemo(() => {
    const n = new THREE.Vector3(hit.normal[0], hit.normal[1], hit.normal[2]).normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    return q;
  }, [hit.normal]);

  const snapLabel =
    hit.snapKind === 'corner'
      ? 'Corner'
      : hit.snapKind === 'edge'
        ? 'Edge'
        : hit.snapKind === 'wall'
          ? 'Wall'
          : hit.snapKind === 'grid'
            ? 'Grid'
            : null;

  return (
    <group position={hit.point} quaternion={quat} userData={{ measureGizmo: true }}>
      <mesh userData={{ measureGizmo: true }}>
        <ringGeometry args={[RETICLE_RADIUS * 0.55, RETICLE_RADIUS, 32]} />
        <meshBasicMaterial
          color={hit.snapKind ? MEASURE_COLOR_HOT : MEASURE_COLOR}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh userData={{ measureGizmo: true }}>
        <circleGeometry args={[0.25, 12]} />
        <meshBasicMaterial
          color={hit.snapKind ? MEASURE_COLOR_HOT : MEASURE_COLOR}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      {snapLabel ? (
        <Html position={[0, 0, 0.5]} center style={{ pointerEvents: 'none' }}>
          <div className="dg-measure-snap-badge">{snapLabel}</div>
        </Html>
      ) : null}
    </group>
  );
}

/**
 * Renders committed session measurements, the pending rubber band, and the hover reticle.
 * Mounted outside the measure-tool gate so results stay visible after exiting the tool.
 */
export function MeasurementsLayer() {
  const measurements = useStore((s) => s.measurements);
  const pending = useStore((s) => s.measurePending);
  const hover = useStore((s) => s.measureHover);
  const measuring = useStore((s) => s.designerTool === 'measure');

  const showRubber = measuring && pending && hover;
  const showReticle = measuring && hover;

  return (
    <group>
      {measurements.map((m) => (
        <CommittedMeasurement key={m.id} measurement={m} />
      ))}

      {pending ? <MeasureDot position={pending} hot /> : null}

      {showRubber && pending && hover ? (
        <group userData={{ measureGizmo: true }}>
          <Line
            points={[pending, hover.point]}
            color={MEASURE_COLOR_HOT}
            lineWidth={1.25}
            transparent
            opacity={0.7}
            dashed
            dashSize={2}
            gapSize={1.5}
            userData={{ measureGizmo: true }}
          />
          <MeasureReadoutLabel a={pending} b={hover.point} />
        </group>
      ) : null}

      {showReticle && hover ? <Reticle hit={hover} /> : null}
    </group>
  );
}
