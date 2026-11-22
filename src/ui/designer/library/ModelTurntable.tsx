import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, Center, ContactShadows, OrbitControls, useBounds, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildBuiltinPreviewObject } from '../../../lib/generateBuiltinThumbnail';
import { shouldStandImportedUpright, standUpRotationAxis } from '../../../lib/importedUpright';
import { normalizeImportedMaterials } from '../../../lib/normalizeImportedMaterials';
import { isProceduralBuiltinKind } from '../../../lib/placeGalleryModel';
import type { CatalogModel } from '../chromeTypes';

const LOAD_TIMEOUT_MS = 20_000;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else (mat as THREE.Material | undefined)?.dispose?.();
    }
  });
}

/** Scale a mesh so its largest axis matches the largest catalog inch dim. Returns false if bbox is empty. */
function normalizeToCatalogInches(
  root: THREE.Object3D,
  widthIn: number,
  heightIn: number,
  depthIn: number,
): boolean {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return false;
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxMesh = Math.max(size.x, size.y, size.z);
  if (maxMesh < 1e-6) return false;
  const maxTarget = Math.max(widthIn, heightIn, depthIn, 1);
  root.scale.multiplyScalar(maxTarget / maxMesh);
  root.updateMatrixWorld(true);
  return true;
}

function useStableCallback<Args extends unknown[]>(fn: ((...args: Args) => void) | undefined) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  }, [fn]);
  return useRef((...args: Args) => {
    ref.current?.(...args);
  }).current;
}

function FailMesh({ onError }: { onError: () => void }) {
  useLayoutEffect(() => {
    onError();
  }, [onError]);
  return null;
}

/** Same IBL path as catalog thumbs / room scene — procedural RoomEnvironment, no HDR fetch. */
function TurntableEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.7;
    room.dispose();
    return () => {
      if (scene.environment === envMap) {
        scene.environment = null;
        scene.environmentIntensity = 1;
      }
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function BuiltinMesh({
  kind,
  onMesh,
  onError,
}: {
  kind: string;
  onMesh: (obj: THREE.Object3D) => void;
  onError: () => void;
}) {
  const group = useMemo(() => buildBuiltinPreviewObject(kind), [kind]);
  useEffect(() => {
    return () => {
      if (group) disposeObject(group);
    };
  }, [group]);
  useLayoutEffect(() => {
    if (!group) {
      onError();
      return;
    }
    onMesh(group);
  }, [group, onMesh, onError]);
  if (!group) return null;
  return <primitive object={group} />;
}

function applyStandUpIfNeeded(root: THREE.Object3D, label: string | undefined) {
  if (!shouldStandImportedUpright(label)) return;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3();
  box.getSize(size);
  const axis = standUpRotationAxis([size.x, size.y, size.z]);
  if (axis === 'x') root.rotation.x = Math.PI / 2;
  if (axis === 'z') root.rotation.z = Math.PI / 2;
  if (axis) root.updateMatrixWorld(true);
}

function ImportedMesh({
  url,
  label,
  widthIn,
  heightIn,
  depthIn,
  onMesh,
  onError,
}: {
  url: string;
  label?: string;
  widthIn: number;
  heightIn: number;
  depthIn: number;
  onMesh: (obj: THREE.Object3D) => void;
  onError: () => void;
}) {
  const gltf = useGLTF(url);
  const clone = useMemo(() => {
    const scene = gltf.scene.clone(true);
    // Same material pass as placement / GlbTurntablePreview / catalog thumbs.
    normalizeImportedMaterials(scene, { relight: true });
    applyStandUpIfNeeded(scene, label);
    // Prefer catalog-inch normalize; if that fails, still try framing the unscaled
    // clone. Only empty bbox is a hard error.
    if (!normalizeToCatalogInches(scene, widthIn, heightIn, depthIn)) {
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return null;
    }
    return scene;
  }, [gltf.scene, label, widthIn, heightIn, depthIn]);
  useEffect(() => () => {
    if (clone) disposeObject(clone);
  }, [clone]);
  useLayoutEffect(() => {
    if (!clone) {
      onError();
      return;
    }
    onMesh(clone);
  }, [clone, onMesh, onError]);
  if (!clone) return null;
  return <primitive object={clone} />;
}

function SpinningContent({ spin, children }: { spin: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!spin || !ref.current) return;
    ref.current.rotation.y += dt * 0.55;
  });
  return <group ref={ref}>{children}</group>;
}

/** Fit once after the mesh is in the tree, then signal ready. */
function FitThenReady({
  meshVersion,
  onReady,
  children,
}: {
  meshVersion: number;
  onReady: () => void;
  children: ReactNode;
}) {
  const api = useBounds();
  const contentRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const fired = useRef(0);

  useLayoutEffect(() => {
    if (meshVersion === 0 || !contentRef.current || !sphereRef.current) return;
    if (fired.current === meshVersion) return;
    const content = contentRef.current;
    const sphere = sphereRef.current;
    const tryFit = (): boolean => {
      try {
        content.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(content);
        if (!box.isEmpty()) {
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          const radius = Math.max(size.length() * 0.5, 0.001);
          sphere.position.copy(center);
          sphere.scale.setScalar(radius);
          sphere.updateMatrixWorld(true);
        }
        const parent = content.parent;
        if (!parent) return false;
        api.refresh(parent).clip().fit();
        fired.current = meshVersion;
        onReady();
        return true;
      } catch {
        return false;
      }
    };
    // Same layout pass first — preloaded GLBs often skip Suspense and are already
    // in the tree when Bounds mounts.
    if (tryFit()) return;
    const id = requestAnimationFrame(() => {
      if (tryFit()) return;
      requestAnimationFrame(() => {
        if (!tryFit()) onReady();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [meshVersion, api, onReady]);

  return (
    <group>
      <group ref={contentRef}>{children}</group>
      {/* Invisible sphere so Bounds frames every yaw of a spinning wide mesh. */}
      <mesh ref={sphereRef} visible={false} raycast={() => null}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

function TurntableScene({
  model,
  interactive,
  onReady,
  onError,
}: {
  model: CatalogModel;
  interactive: boolean;
  onReady: () => void;
  onError: () => void;
}) {
  const reduce = prefersReducedMotion();
  const url = model.signedUrl;
  const [meshVersion, setMeshVersion] = useState(0);
  const stableReady = useStableCallback(onReady);
  const stableError = useStableCallback(onError);

  const onMesh = useStableCallback((_obj: THREE.Object3D) => {
    setMeshVersion((v) => v + 1);
  });

  // Match placement: bank GLBs are is_builtin but must use ImportedMesh, not procedural.
  const useImported = Boolean(url) && !isProceduralBuiltinKind(model.kind);
  const content = useImported ? (
    <ImportedMesh
      url={url!}
      label={model.label}
      widthIn={model.width_in}
      heightIn={model.height_in}
      depthIn={model.depth_in}
      onMesh={onMesh}
      onError={stableError}
    />
  ) : isProceduralBuiltinKind(model.kind) ? (
    <BuiltinMesh kind={model.kind} onMesh={onMesh} onError={stableError} />
  ) : (
    <FailMesh onError={stableError} />
  );

  return (
    <>
      {/* Match thumbnailRenderer: ambient + key/fill + RoomEnvironment IBL. */}
      <TurntableEnvironment />
      <ambientLight intensity={0.62} />
      <directionalLight position={[2.5, 4, 3]} intensity={0.88} />
      <directionalLight position={[-2, 1, -1]} intensity={0.35} />
      {/* Suspense outside Bounds so Bounds never observes an empty suspended tree. */}
      <Suspense fallback={null}>
        {/* maxDuration=0: skip Bounds camera zoom intro; spin starts at final framing. */}
        <Bounds fit clip margin={1.15} maxDuration={0}>
          <FitThenReady meshVersion={meshVersion} onReady={stableReady}>
            <Center>
              <SpinningContent spin={!interactive && !reduce}>{content}</SpinningContent>
            </Center>
          </FitThenReady>
        </Bounds>
      </Suspense>
      <ContactShadows opacity={0.28} scale={48} blur={2.4} far={40} />
      {interactive ? (
        <OrbitControls
          enablePan={false}
          minDistance={20}
          maxDistance={180}
          maxPolarAngle={Math.PI / 2.05}
        />
      ) : null}
    </>
  );
}

class TurntableErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {
    this.props.onError?.();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export interface ModelTurntableProps {
  model: CatalogModel;
  /** Orbit controls; otherwise auto-spin. */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  onError?: () => void;
}

/** Single shared-style WebGL preview. Mount at most one at a time. */
export function ModelTurntable({
  model,
  interactive = false,
  className,
  style,
  onReady,
  onError,
}: ModelTurntableProps) {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  // 20s load timeout — hang → fall back to thumb (heavier bank GLBs).
  useEffect(() => {
    readyRef.current = false;
    setReady(false);
    const id = window.setTimeout(() => {
      if (!readyRef.current) onErrorRef.current?.();
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [model.kind, model.signedUrl]);

  // Nothing to preview: keep the caller's thumb.
  if (!isProceduralBuiltinKind(model.kind) && !model.signedUrl) return null;

  const markReady = () => {
    if (readyRef.current) return;
    readyRef.current = true;
    setReady(true);
    onReadyRef.current?.();
  };

  const markError = () => {
    onErrorRef.current?.();
  };

  return (
    <TurntableErrorBoundary onError={markError}>
      <div
        className={`dgl-turntable${ready ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        role="img"
        aria-label={`3D preview of ${model.label}`}
      >
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [40, 30, 50], fov: 35, near: 1, far: 2000 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          <TurntableScene
            model={model}
            interactive={interactive}
            onReady={markReady}
            onError={markError}
          />
        </Canvas>
      </div>
    </TurntableErrorBoundary>
  );
}

/** Warm the GLTF cache on hover intent (ImportedMesh path only). */
export function preloadCatalogModel(model: CatalogModel) {
  if (model.signedUrl && !isProceduralBuiltinKind(model.kind)) {
    try {
      useGLTF.preload(model.signedUrl);
    } catch {
      /* ignore */
    }
  }
}

export default ModelTurntable;
