import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Room } from './Room';
import { ItemsLayer } from '../furniture/ItemsLayer';
import { DragController } from '../interaction/DragController';
import { KeyboardShortcuts } from '../interaction/KeyboardShortcuts';
import { ArcMenu } from './ArcMenu';
import { useStore } from '../store';
import { sampleSun } from '../lib/environment';
import { WindowLightShafts } from './WindowLightShafts';

const SCENE_BG = '#E4DAC8';

// Image-based lighting: a deterministic in-memory RoomEnvironment PMREM gives PBR
// materials the indirect/reflection term they need. Community GLBs (metallic or
// reflection-baked) render nearly black without it; built-ins never had an env map.
//
// Neutral swap: the hemisphere fill cedes IBL_AMBIENT_FRACTION of its role to the
// env map so built-ins keep ~the same total irradiance while imports gain reflections.
// scene.environmentIntensity is the `k` from k = f·A·S/(π·L_env); both terms scale with
// sun.ambient so the balance tracks the day/night cycle. Tune these two if built-ins
// drift brighter/darker after the swap.
const IBL_AMBIENT_FRACTION = 0.4;
const IBL_INTENSITY_SCALE = 0.25;

export interface SceneHandle {
  resetCamera: () => void;
}

function EnvironmentRig() {
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, geom),
    [timeOfDay, orientationDeg, geom],
  );

  const target = useMemo(
    () => [geom.width / 2, 0, geom.depth / 2] as [number, number, number],
    [geom.width, geom.depth],
  );

  // Fit the ortho shadow frustum to the room so each of the 2048² texels covers less
  // world space — big fixed frustums were the source of the coarse self-shadow banding.
  const shadowExtent = useMemo(
    () => Math.max(geom.width, geom.depth) * 0.85 + 50,
    [geom.width, geom.depth],
  );

  useLayoutEffect(() => {
    const light = lightRef.current;
    const t = targetRef.current;
    if (light && t) light.target = t;
  }, []);

  return (
    <>
      <hemisphereLight
        args={[sun.skyColor, sun.groundColor, sun.ambient * exposure * (1 - IBL_AMBIENT_FRACTION)]}
      />
      <directionalLight
        ref={lightRef}
        position={sun.position}
        color={sun.color}
        intensity={sun.intensity * exposure}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={800}
        // normalBias offsets along the surface normal to kill self-shadow acne on
        // dense/curved imported meshes; the small negative bias removes residual banding.
        shadow-normalBias={1.5}
        shadow-bias={-0.0004}
      />
      {/* World-space target — must not be parented under the light or shadows aim wrong. */}
      <object3D ref={targetRef} position={target} />
    </>
  );
}

/**
 * Builds a RoomEnvironment PMREM once and drives its strength from the sun so
 * IBL dims at night. Applies to every MeshStandardMaterial in the scene via
 * `scene.environment` (built-ins and imports alike carry no own envMap).
 */
function ImageBasedLighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;
    room.dispose();
    return () => {
      if (scene.environment === envMap) scene.environment = null;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  const ambient = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, geom).ambient,
    [timeOfDay, orientationDeg, geom],
  );

  useEffect(() => {
    scene.environmentIntensity = ambient * exposure * IBL_INTENSITY_SCALE;
  }, [scene, ambient, exposure]);

  return null;
}

function SkyBackground() {
  const { scene, gl } = useThree();
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const skyMode = useStore((s) => s.environment.skyMode);
  const geom = useStore((s) => s.roomGeometry);

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, geom),
    [timeOfDay, orientationDeg, geom],
  );

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, sun.skyTop);
      grad.addColorStop(1, sun.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [sun.skyTop, sun.skyBottom]);

  useEffect(() => {
    if (skyMode === 'gradient') {
      scene.background = texture;
      gl.setClearColor(sun.skyBottom);
    } else {
      scene.background = new THREE.Color(SCENE_BG);
      gl.setClearColor(SCENE_BG);
    }
  }, [skyMode, texture, scene, gl, sun.skyBottom]);

  useEffect(() => () => texture.dispose(), [texture]);

  return null;
}

function CompassRose() {
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const geom = useStore((s) => s.roomGeometry);
  const cx = geom.width / 2;
  const cz = geom.depth / 2;
  const r = 28;
  const yaw = -(orientationDeg * Math.PI) / 180;

  const labels: { text: string; angle: number }[] = [
    { text: 'N', angle: 0 },
    { text: 'E', angle: Math.PI / 2 },
    { text: 'S', angle: Math.PI },
    { text: 'W', angle: (3 * Math.PI) / 2 },
  ];

  return (
    <group position={[cx, 0.2, cz]} rotation={[0, yaw, 0]}>
      {labels.map(({ text, angle }) => {
        const x = Math.sin(angle) * r;
        const z = Math.cos(angle) * r;
        return (
          <Text
            key={text}
            position={[x, 0, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={6}
            color="#6a543a"
            fillOpacity={0.35}
            anchorX="center"
            anchorY="middle"
          >
            {text}
          </Text>
        );
      })}
    </group>
  );
}

function SceneInner({ controlsRef }: { controlsRef: RefObject<OrbitControlsType | null> }) {
  const deselect = useStore((s) => s.select);
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const geom = useStore((s) => s.roomGeometry);

  const camera = useMemo(
    () => ({
      position: [geom.width / 2 + 180, 140, geom.depth / 2 + 240] as [number, number, number],
      target: [geom.width / 2, 30, geom.depth / 2] as [number, number, number],
    }),
    [geom.width, geom.depth],
  );

  const backdrop = useMemo(() => {
    if (skyMode === 'studio') return SCENE_BG;
    return sampleSun(timeOfDay, orientationDeg, geom).skyBottom;
  }, [skyMode, timeOfDay, orientationDeg, geom]);

  return (
    <Canvas
      shadows
      camera={{
        position: camera.position,
        fov: 35,
        near: 1,
        far: 2000,
      }}
      onPointerMissed={() => deselect(null)}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(backdrop);
        scene.background = new THREE.Color(backdrop);
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      }}
      style={{ width: '100%', height: '100%', background: backdrop }}
    >
      <SkyBackground />
      <ImageBasedLighting />
      <EnvironmentRig />

      <Grid
        position={[geom.width / 2, 0.1, geom.depth / 2]}
        args={[geom.width, geom.depth]}
        cellSize={12}
        cellThickness={0.6}
        cellColor="#6a543a"
        sectionSize={60}
        sectionThickness={1.2}
        sectionColor="#8a6e4e"
        fadeDistance={500}
        infiniteGrid={false}
      />
      <CompassRose />

      <Room />
      <ItemsLayer />
      <ArcMenu />
      <DragController />
      <KeyboardShortcuts />
      <WindowLightShafts />

      <OrbitControls
        ref={controlsRef as never}
        target={camera.target}
        minDistance={60}
        maxDistance={650}
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enableDamping
        dampingFactor={0.08}
        makeDefault
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </Canvas>
  );
}

export const Scene = forwardRef<SceneHandle>(function Scene(_, ref) {
  const controlsRef = useRef<OrbitControlsType>(null);
  const geom = useStore((s) => s.roomGeometry);

  useImperativeHandle(ref, () => ({
    resetCamera() {
      const ctrl = controlsRef.current;
      if (!ctrl) return;
      ctrl.object.position.set(geom.width / 2 + 180, 140, geom.depth / 2 + 240);
      ctrl.target.set(geom.width / 2, 30, geom.depth / 2);
      ctrl.update();
    },
  }), [geom.width, geom.depth]);

  return <SceneInner controlsRef={controlsRef} />;
});
