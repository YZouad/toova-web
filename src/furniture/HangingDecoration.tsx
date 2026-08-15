import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, type Item } from '../store';
import { SelectionOutline } from './SelectionOutline';
import { resolveRenderQuality } from '../lib/renderQuality';
import {
  buildHangingPath,
  leafCountForPath,
  ledSpacingInches,
  mulberry32,
  paletteColorAt,
  pathBounds,
  pathLength,
  resolveAnchors,
  sampleAlongPath,
  type FurniturePose,
  type Vec3,
} from '../lib/hangingDecorGeometry';
import { allWallSegments } from '../lib/roomGeometry';

const LEAF_URL = '/textures/hanging/leaf.png';
const UP = new THREE.Vector3(0, 1, 0);
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _tmp = new THREE.Vector3();

interface Props {
  item: Item;
  selected: boolean;
  invalid: boolean;
}

function qualityLeafMul(tier: string): number {
  switch (tier) {
    case 'low':
      return 0.45;
    case 'balanced':
      return 0.75;
    case 'high':
      return 1;
    case 'presentation':
      return 1.25;
    default:
      return 0.75;
  }
}

function maxRealLights(tier: string): number {
  switch (tier) {
    case 'low':
      return 1;
    case 'balanced':
      return 3;
    case 'high':
      return 6;
    case 'presentation':
      return 8;
    default:
      return 3;
  }
}

function tubeSegments(tier: string): number {
  switch (tier) {
    case 'low':
      return 8;
    case 'balanced':
      return 12;
    case 'high':
      return 20;
    case 'presentation':
      return 28;
    default:
      return 12;
  }
}

/** Stable fingerprint of furniture poses so hanging updates don't rebuild the map. */
function furniturePoseFingerprint(items: Record<string, Item>): string {
  const parts: string[] = [];
  for (const it of Object.values(items)) {
    if (it.kind === 'hanging') continue;
    const [px, py, pz] = it.position;
    const [sx, sy, sz] = it.size;
    parts.push(
      `${it.attachmentKey}:${px.toFixed(2)},${py.toFixed(2)},${pz.toFixed(2)},${it.rotationY.toFixed(3)},${sx.toFixed(2)},${sy.toFixed(2)},${sz.toFixed(2)}`,
    );
  }
  parts.sort();
  return parts.join('|');
}

export function HangingDecoration({ item, selected, invalid }: Props) {
  const config = item.hanging;
  const geom = useStore((s) => s.roomGeometry);
  const furnitureFp = useStore((s) => furniturePoseFingerprint(s.items));
  const quality = useStore((s) => s.visual.quality);
  const q = resolveRenderQuality(quality);
  const capturing = useStore((s) => s.captureMode);
  const syncedSigRef = useRef<string>('');

  const furnitureMap = useMemo(() => {
    const map = new Map<string, FurniturePose>();
    for (const it of Object.values(useStore.getState().items)) {
      if (it.kind === 'hanging') continue;
      map.set(it.attachmentKey, {
        attachmentKey: it.attachmentKey,
        position: it.position,
        rotationY: it.rotationY,
        size: it.size,
      });
    }
    return map;
  }, [furnitureFp]);

  const resolved = useMemo(() => {
    if (!config) return [];
    return resolveAnchors(geom, furnitureMap, config.anchors).resolved;
  }, [config, geom, furnitureMap]);

  const worldPoints = useMemo(
    () => resolved.map((r) => r.position),
    [resolved],
  );

  const samplesPerSpan = tubeSegments(q.tier);
  const path = useMemo(() => {
    if (!config || worldPoints.length < 2) return [] as Vec3[];
    return buildHangingPath(worldPoints, config.sag, samplesPerSpan);
  }, [config, worldPoints, samplesPerSpan]);

  const bounds = useMemo(() => pathBounds(path), [path]);

  // Keep store footprint in sync so selection outline / dirty fingerprint stay sane.
  // Signature-gated so floating-point wobble can't thrash setState into a freeze.
  useEffect(() => {
    if (!config || path.length < 2) return;
    const nextPos = bounds.center;
    const nextSize = bounds.size;
    const sig = `${item.id}:${nextPos.map((n) => n.toFixed(2)).join(',')}:${nextSize.map((n) => n.toFixed(2)).join(',')}`;
    if (syncedSigRef.current === sig) return;
    const cur = useStore.getState().items[item.id];
    if (!cur) return;
    const posChanged =
      Math.abs(cur.position[0] - nextPos[0]) > 0.05 ||
      Math.abs(cur.position[1] - nextPos[1]) > 0.05 ||
      Math.abs(cur.position[2] - nextPos[2]) > 0.05;
    const sizeChanged =
      Math.abs(cur.size[0] - nextSize[0]) > 0.05 ||
      Math.abs(cur.size[1] - nextSize[1]) > 0.05 ||
      Math.abs(cur.size[2] - nextSize[2]) > 0.05;
    if (!posChanged && !sizeChanged) {
      syncedSigRef.current = sig;
      return;
    }
    syncedSigRef.current = sig;
    useStore.setState((s) => {
      const it = s.items[item.id];
      if (!it) return s;
      return {
        items: {
          ...s.items,
          [item.id]: {
            ...it,
            position: posChanged ? nextPos : it.position,
            size: sizeChanged ? nextSize : it.size,
          },
        },
      };
    });
  }, [bounds, config, item.id, path.length]);

  if (!config || path.length < 2) return null;

  const outlineColor = invalid ? '#e24b4a' : '#4f8cff';

  return (
    <group userData={{ itemId: item.id, hanging: true }}>
      {/*
        Pick only the strand geometry (tube / leaves / LEDs) — never an AABB.
        A bounding-box pick volume fills the whole loop and blocks furniture
        underneath when looking from above.
      */}
      <HangingVisual
        config={config}
        path={path}
        worldPoints={worldPoints}
        qualityTier={q.tier}
        selected={selected}
        showAnchors={selected && !capturing}
        sway={q.tier !== 'low'}
      />
      {selected ? (
        <SelectionOutline size={item.size} color={outlineColor} />
      ) : null}
    </group>
  );
}

function HangingVisual({
  config,
  path,
  worldPoints,
  qualityTier,
  selected,
  showAnchors,
  sway,
}: {
  config: NonNullable<Item['hanging']>;
  path: Vec3[];
  worldPoints: Vec3[];
  qualityTier: string;
  selected: boolean;
  showAnchors: boolean;
  sway: boolean;
}) {
  // Path is in world space; parent ItemsLayer places the group at item.position.
  // Convert path to local by subtracting the path bounds center (bottom).
  const bounds = useMemo(() => pathBounds(path), [path]);
  const localPath = useMemo(
    () =>
      path.map(
        (p): Vec3 => [
          p[0] - bounds.center[0],
          p[1] - bounds.center[1],
          p[2] - bounds.center[2],
        ],
      ),
    [path, bounds],
  );
  const localAnchors = useMemo(
    () =>
      worldPoints.map(
        (p): Vec3 => [
          p[0] - bounds.center[0],
          p[1] - bounds.center[1],
          p[2] - bounds.center[2],
        ],
      ),
    [worldPoints, bounds],
  );

  const curve = useMemo(() => {
    const pts = localPath.map((p) => new THREE.Vector3(...p));
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15);
  }, [localPath]);

  const tubeGeo = useMemo(() => {
    const radial = qualityTier === 'low' ? 3 : 5;
    const tubular = Math.max(8, localPath.length * 2);
    const radius = config.kind === 'leaves' ? 0.12 : 0.06;
    return new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  }, [curve, localPath.length, config.kind, qualityTier]);

  /** Slightly thicker invisible tube so thin strands stay clickable without an AABB hull. */
  const pickGeo = useMemo(() => {
    const tubular = Math.max(8, localPath.length * 2);
    const radius = config.kind === 'leaves' ? 0.9 : 0.55;
    return new THREE.TubeGeometry(curve, tubular, radius, 5, false);
  }, [curve, localPath.length, config.kind]);

  useEffect(() => () => tubeGeo.dispose(), [tubeGeo]);
  useEffect(() => () => pickGeo.dispose(), [pickGeo]);

  const cableColor = config.kind === 'leaves' ? '#3a5c32' : '#1a1a1a';

  return (
    <group>
      <mesh geometry={pickGeo} visible={false}>
        <meshBasicMaterial />
      </mesh>
      <mesh geometry={tubeGeo} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial
          color={cableColor}
          roughness={config.kind === 'leaves' ? 0.95 : 0.92}
          metalness={0.02}
        />
      </mesh>

      {config.kind === 'leaves' ? (
        <LeafTextureGate
          path={localPath}
          density={config.density}
          seed={config.seed}
          qualityTier={qualityTier}
          sway={sway}
        />
      ) : (
        <LedInstances
          path={localPath}
          density={config.density}
          palette={config.palette}
          lightIntensity={config.lightIntensity}
          lightRange={config.lightRange}
          qualityTier={qualityTier}
        />
      )}

      {showAnchors
        ? localAnchors.map((p, i) => (
            <mesh key={i} position={p}>
              <sphereGeometry args={[0.7, 12, 12]} />
              <meshStandardMaterial
                color={selected ? '#4f8cff' : '#ffffff'}
                emissive="#4f8cff"
                emissiveIntensity={0.4}
                toneMapped={false}
              />
            </mesh>
          ))
        : null}
    </group>
  );
}

/** Load leaf texture without Suspense suspension so vines never blank out. */
function LeafTextureGate({
  path,
  density,
  seed,
  qualityTier,
  sway,
}: {
  path: Vec3[];
  density: number;
  seed: number;
  qualityTier: string;
  sway: boolean;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      LEAF_URL,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        setTexture(tex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );

  return (
    <LeafInstances
      path={path}
      density={density}
      seed={seed}
      qualityTier={qualityTier}
      sway={sway}
      texture={texture}
    />
  );
}

function LeafInstances({
  path,
  density,
  seed,
  qualityTier,
  sway,
  texture,
}: {
  path: Vec3[];
  density: number;
  seed: number;
  qualityTier: string;
  sway: boolean;
  texture: THREE.Texture | null;
}) {
  const len = pathLength(path);
  // Denser sampling → fuller garland of smaller leaves
  const count = Math.round(leafCountForPath(len, density, qualityLeafMul(qualityTier)) * 1.35);
  const spacing = len / Math.max(1, count - 1);
  const samples = useMemo(
    () => sampleAlongPath(path, Math.max(1.1, spacing)),
    [path, spacing],
  );

  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const tintColors = useMemo(() => {
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const cols: THREE.Color[] = [];
    const palette = [
      new THREE.Color('#4a8f3c'),
      new THREE.Color('#3d7a35'),
      new THREE.Color('#5a9e48'),
      new THREE.Color('#2f6b2c'),
      new THREE.Color('#6aad52'),
      new THREE.Color('#457838'),
    ];
    for (let i = 0; i < samples.length; i++) {
      const base = palette[Math.floor(rng() * palette.length)]!.clone();
      base.offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.1);
      cols.push(base);
    }
    return cols;
  }, [samples.length, seed]);

  const baseMatrices = useMemo(() => {
    const rng = mulberry32(seed);
    const mats: THREE.Matrix4[] = [];
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);
    const look = new THREE.Vector3();

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      tangent.set(s.tangent[0], s.tangent[1], s.tangent[2]).normalize();
      // Perpendicular in XZ, then blend with world-up for a hanging feel
      side.set(-tangent.z, 0, tangent.x);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const flip = i % 2 === 0 ? 1 : -1;
      const sideAmt = flip * (0.55 + rng() * 0.85);
      const along = (rng() - 0.5) * 0.5;
      const drop = 0.15 + rng() * 0.55;

      _pos.set(
        s.position[0] + side.x * sideAmt + tangent.x * along,
        s.position[1] - drop,
        s.position[2] + side.z * sideAmt + tangent.z * along,
      );

      // Tip points slightly downward and outward from the vine
      look.copy(side).multiplyScalar(flip).addScaledVector(down, 0.85 + rng() * 0.4);
      look.addScaledVector(tangent, (rng() - 0.5) * 0.5).normalize();
      _quat.setFromUnitVectors(new THREE.Vector3(0, -1, 0), look);
      // Twirl around leaf axis
      _quat.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          (rng() - 0.5) * 0.9,
        ),
      );
      // Face-ish toward camera plane by slight pitch
      _quat.multiply(
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler((rng() - 0.5) * 0.35, 0, (rng() - 0.5) * 0.5, 'YXZ'),
        ),
      );

      const scale = 1.6 + rng() * 1.15; // ~1.6–2.75" — delicate, not billboards
      const aspect = 0.52 + rng() * 0.12;
      _scale.set(scale * aspect, scale, 1);
      _mat.compose(_pos, _quat, _scale);
      mats.push(_mat.clone());
    }
    return mats;
  }, [samples, seed]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < baseMatrices.length; i++) {
      mesh.setMatrixAt(i, baseMatrices[i]!);
      if (tintColors[i]) mesh.setColorAt(i, tintColors[i]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = baseMatrices.length;
  }, [baseMatrices, tintColors]);

  useFrame(({ clock }) => {
    if (!sway || !meshRef.current) return;
    const t = clock.elapsedTime;
    const mesh = meshRef.current;
    for (let i = 0; i < baseMatrices.length; i++) {
      const base = baseMatrices[i]!;
      base.decompose(_pos, _quat, _scale);
      const wobble = Math.sin(t * 0.9 + i * 0.41) * 0.025;
      _quat.multiply(new THREE.Quaternion().setFromAxisAngle(UP, wobble));
      _mat.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const material = useMemo(() => {
    if (texture) {
      return new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.22,
        side: THREE.DoubleSide,
        roughness: 0.72,
        metalness: 0,
        depthWrite: false,
        color: '#ffffff',
      });
    }
    return new THREE.MeshStandardMaterial({
      color: '#4a8f3c',
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0,
    });
  }, [texture]);

  useEffect(() => () => material.dispose(), [material]);

  const leafGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1.55, 2, 4);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Gentle cup + tip curl
      const cup = (1 - (y + 0.775) / 1.55) * x * x * 0.12;
      const curl = Math.sin(((y + 0.775) / 1.55) * Math.PI) * 0.06;
      pos.setZ(i, cup + curl);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => leafGeo.dispose(), [leafGeo]);

  if (samples.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[leafGeo, material, Math.max(1, samples.length)]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    />
  );
}

function LedInstances({
  path,
  density,
  palette,
  lightIntensity,
  lightRange,
  qualityTier,
}: {
  path: Vec3[];
  density: number;
  palette: string[];
  lightIntensity: number;
  lightRange: number;
  qualityTier: string;
}) {
  const spacing = ledSpacingInches(density);
  const samples = useMemo(() => sampleAlongPath(path, spacing), [path, spacing]);
  const meshRef = useRef<THREE.InstancedMesh>(null!);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      _pos.set(...s.position);
      _quat.identity();
      _scale.set(1, 1, 1);
      _mat.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(i, _mat);
      c.set(paletteColorAt(palette.length ? palette : ['#fff4e0'], i));
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = samples.length;
  }, [samples, palette]);

  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.28, 8, 8), []);
  useEffect(() => () => bulbGeo.dispose(), [bulbGeo]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Sparse real lights
  const lightCap = maxRealLights(qualityTier);
  const lightIndices = useMemo(() => {
    if (samples.length === 0) return [] as number[];
    const step = Math.max(1, Math.floor(samples.length / lightCap));
    const idxs: number[] = [];
    for (let i = 0; i < samples.length && idxs.length < lightCap; i += step) {
      idxs.push(i);
    }
    if (idxs.length === 0) idxs.push(0);
    return idxs;
  }, [samples.length, lightCap]);

  if (samples.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[bulbGeo, material, Math.max(1, samples.length)]}
        castShadow={false}
        receiveShadow={false}
        frustumCulled={false}
      />
      {lightIndices.map((idx) => {
        const s = samples[idx]!;
        const col = paletteColorAt(palette.length ? palette : ['#fff4e0'], idx);
        const perLightIntensity =
          (lightIntensity * (qualityTier === 'low' ? 1.4 : 0.9)) /
          Math.max(1, Math.sqrt(lightIndices.length));
        return (
          <pointLight
            key={idx}
            position={s.position}
            color={col}
            intensity={perLightIntensity}
            distance={lightRange}
            decay={2}
            castShadow={false}
          />
        );
      })}
    </>
  );
}

/** Draft preview path rendered in world space (not parented to an item). */
export function HangingDraftPreview() {
  const draft = useStore((s) => s.hangingDraft);
  const geom = useStore((s) => s.roomGeometry);
  const furnitureFp = useStore((s) => furniturePoseFingerprint(s.items));

  const furnitureMap = useMemo(() => {
    const map = new Map<string, FurniturePose>();
    for (const it of Object.values(useStore.getState().items)) {
      if (it.kind === 'hanging') continue;
      map.set(it.attachmentKey, {
        attachmentKey: it.attachmentKey,
        position: it.position,
        rotationY: it.rotationY,
        size: it.size,
      });
    }
    return map;
  }, [furnitureFp]);

  const points = useMemo(() => {
    if (!draft) return [] as Vec3[];
    const { resolved } = resolveAnchors(geom, furnitureMap, draft.anchors);
    const pts = resolved.map((r) => r.position);
    if (draft.cursorWorld) pts.push(draft.cursorWorld);
    return pts;
  }, [draft, geom, furnitureMap]);

  const path = useMemo(() => {
    if (points.length < 2) return [] as Vec3[];
    return buildHangingPath(points, draft?.kind === 'lights' ? 0.14 : 0.18, 12);
  }, [points, draft?.kind]);

  const lineGeo = useMemo(() => {
    if (path.length < 2) return null;
    const positions = new Float32Array(path.length * 3);
    for (let i = 0; i < path.length; i++) {
      positions[i * 3] = path[i]![0];
      positions[i * 3 + 1] = path[i]![1];
      positions[i * 3 + 2] = path[i]![2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Connect consecutive points as segments for LineSegments
    const idx: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      idx.push(i, i + 1);
    }
    g.setIndex(idx);
    return g;
  }, [path]);

  useEffect(() => () => lineGeo?.dispose(), [lineGeo]);

  if (!draft) return null;

  return (
    <group>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.85, 12, 12]} />
          <meshStandardMaterial
            color="#4f8cff"
            emissive="#4f8cff"
            emissiveIntensity={0.6}
            toneMapped={false}
          />
        </mesh>
      ))}
      {lineGeo ? (
        <lineSegments geometry={lineGeo}>
          <lineBasicMaterial color="#4f8cff" linewidth={2} transparent opacity={0.85} />
        </lineSegments>
      ) : null}
      {/* Force wall segments into the dependency graph for future snaps */}
      <group visible={false}>
        {allWallSegments(geom).map((s) => (
          <object3D key={s.wall.id} position={s.innerFaceCenter} />
        ))}
      </group>
    </group>
  );
}
