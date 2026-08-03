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
import { applyWeather, sampleSun } from '../lib/environment';
import { planBounds, planCentroid } from '../lib/roomGeometry';
import { WindowLightShafts } from './WindowLightShafts';
import { RoomVolumetricHaze } from './RoomVolumetricHaze';
import { WeatherSystem } from './WeatherSystem';
import { ProceduralSky } from './ProceduralSky';
import { ScenePostProcessing } from './ScenePostProcessing';

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
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  const targetRef = useRef<THREE.Object3D>(null!);

  const bounds = useMemo(() => planBounds(geom), [geom]);

  const sun = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, bounds),
    [timeOfDay, orientationDeg, bounds],
  );

  const mod = useMemo(
    () => applyWeather(sun, weather, bounds),
    [sun, weather, bounds],
  );

  const [cx, , cz] = useMemo(() => {
    const c = planCentroid(geom);
    return [c[0], 0, c[1]] as [number, number, number];
  }, [geom]);

  const target = useMemo(
    () => [cx, 0, cz] as [number, number, number],
    [cx, cz],
  );

  const shadowExtent = useMemo(() => {
    const b = planBounds(geom);
    return Math.max(b.width, b.depth) * 0.85 + 50;
  }, [geom]);

  useLayoutEffect(() => {
    const light = lightRef.current;
    const t = targetRef.current;
    if (light && t) light.target = t;
  }, []);

  return (
    <>
      <hemisphereLight
        args={[
          sun.skyColor,
          sun.groundColor,
          sun.ambient * exposure * (1 - IBL_AMBIENT_FRACTION) * mod.ambientMul,
        ]}
      />
      <directionalLight
        ref={lightRef}
        position={sun.position}
        color={sun.color}
        intensity={sun.intensity * exposure * mod.sunMul}
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
    () => sampleSun(timeOfDay, orientationDeg, planBounds(geom)).ambient,
    [timeOfDay, orientationDeg, geom],
  );

  useEffect(() => {
    scene.environmentIntensity = ambient * exposure * IBL_INTENSITY_SCALE;
  }, [scene, ambient, exposure]);

  return null;
}

function AtmosphericFog() {
  const { scene, gl } = useThree();
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);

  const bounds = useMemo(() => planBounds(geom), [geom]);

  const mod = useMemo(() => {
    const sun = sampleSun(timeOfDay, orientationDeg, bounds);
    return applyWeather(sun, weather, bounds);
  }, [timeOfDay, orientationDeg, weather, bounds]);

  useEffect(() => {
    if (skyMode === 'gradient') {
      scene.background = null;
      gl.setClearColor('#0a0e14');
    } else {
      scene.background = new THREE.Color(SCENE_BG);
      gl.setClearColor(SCENE_BG);
      scene.fog = null;
    }
  }, [skyMode, scene, gl]);

  useEffect(() => {
    if (skyMode !== 'gradient') return;
    if (mod.fog) {
      scene.fog = new THREE.Fog(mod.fog.color, mod.fog.near, mod.fog.far);
    } else {
      scene.fog = null;
    }
    return () => {
      scene.fog = null;
    };
  }, [skyMode, mod.fog, scene]);

  return null;
}

function CompassRose() {
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const geom = useStore((s) => s.roomGeometry);
  const [cx, cz] = planCentroid(geom);
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

/** Bridges imperative SceneHandle into the R3F canvas (needs controls). */
function SceneApiBridge({
  apiRef,
  controlsRef,
}: {
  apiRef: RefObject<SceneHandle | null>;
  controlsRef: RefObject<OrbitControlsType | null>;
}) {
  const geom = useStore((s) => s.roomGeometry);

  useImperativeHandle(
    apiRef,
    () => ({
      resetCamera() {
        const ctrl = controlsRef.current;
        if (!ctrl) return;
        const b = planBounds(geom);
        const [cx, cz] = planCentroid(geom);
        const span = Math.max(b.width, b.depth);
        ctrl.object.position.set(cx + span * 0.9, span * 0.55, cz + span * 1.1);
        ctrl.target.set(cx, 30, cz);
        ctrl.update();
      },
    }),
    [controlsRef, geom],
  );

  return null;
}

function SceneInner({
  controlsRef,
  apiRef,
  readOnly,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  apiRef: RefObject<SceneHandle | null>;
  readOnly: boolean;
}) {
  const deselect = useStore((s) => s.select);
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);

  const camera = useMemo(() => {
    const b = planBounds(geom);
    const [cx, cz] = planCentroid(geom);
    const span = Math.max(b.width, b.depth);
    return {
      position: [cx + span * 0.9, span * 0.55, cz + span * 1.1] as [number, number, number],
      target: [cx, 30, cz] as [number, number, number],
    };
  }, [geom]);

  const backdrop = useMemo(() => {
    if (skyMode === 'studio') return SCENE_BG;
    const sun = sampleSun(timeOfDay, orientationDeg, planBounds(geom));
    return applyWeather(sun, weather, planBounds(geom)).skyBottom;
  }, [skyMode, timeOfDay, orientationDeg, weather, geom]);

  return (
    <Canvas
      shadows
      camera={{
        position: camera.position,
        fov: 35,
        near: 1,
        far: 2000,
      }}
      onPointerMissed={() => {
        if (!readOnly) deselect(null);
      }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(backdrop);
        scene.background = new THREE.Color(backdrop);
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      }}
      style={{ width: '100%', height: '100%', background: backdrop }}
    >
      <SceneApiBridge apiRef={apiRef} controlsRef={controlsRef} />
      <AtmosphericFog />
      <ImageBasedLighting />
      <EnvironmentRig />
      <ProceduralSky />
      <WeatherSystem />

      {!readOnly ? (
        <>
          <Grid
            position={[planCentroid(geom)[0], 0.1, planCentroid(geom)[1]]}
            args={[planBounds(geom).width, planBounds(geom).depth]}
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
        </>
      ) : null}

      <Room />
      <ItemsLayer />
      {!readOnly ? (
        <>
          <ArcMenu />
          <DragController />
          <KeyboardShortcuts />
        </>
      ) : null}
      <WindowLightShafts />
      <RoomVolumetricHaze />

      <ScenePostProcessing />

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

export interface SceneProps {
  readOnly?: boolean;
}

export const Scene = forwardRef<SceneHandle, SceneProps>(function Scene(
  { readOnly = false },
  ref,
) {
  const controlsRef = useRef<OrbitControlsType>(null);
  const apiRef = useRef<SceneHandle | null>(null);

  useImperativeHandle(ref, () => ({
    resetCamera() {
      apiRef.current?.resetCamera();
    },
  }));

  return <SceneInner controlsRef={controlsRef} apiRef={apiRef} readOnly={readOnly} />;
});
