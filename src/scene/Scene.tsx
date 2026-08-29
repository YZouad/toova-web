import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Room } from './Room';
import { ItemsLayer } from '../furniture/ItemsLayer';
import { DragController } from '../interaction/DragController';
import { KeyboardShortcuts } from '../interaction/KeyboardShortcuts';
import { HangingPlacementController } from '../interaction/HangingPlacementController';
import { ArcMenu } from './ArcMenu';
import { ObjectGizmo } from './ObjectGizmo';
import { HangingDraftPreview } from '../furniture/HangingDecoration';
import { useStore, type CameraPresetId } from '../store';
import { applyWeather, isDaytime, sampleSun, indoorHorizonFill, grazingSunIndoor } from '../lib/environment';
import { planBounds, planCentroid } from '../lib/roomGeometry';
import { WindowLightShafts } from './WindowLightShafts';
import { RoomVolumetricHaze } from './RoomVolumetricHaze';
import { WeatherSystem } from './WeatherSystem';
import { ProceduralSky } from './ProceduralSky';
import { ScenePostProcessing } from './ScenePostProcessing';
import { resolveRenderQuality } from '../lib/renderQuality';
import { framingForPreset } from '../lib/presentationCameras';
import { CameraOrbitSync } from './CameraOrbitSync';
import { SHADOW_ONLY_LAYER } from './shadowLayers';

const SCENE_BG = '#E4DAC8';

/** Fraction of ambient that IBL carries vs hemisphere. */
const IBL_AMBIENT_FRACTION = 0.4;
/** Scales scene.environmentIntensity — raised so PBR imports respond to IBL. */
const IBL_INTENSITY_SCALE = 0.48;

export interface CaptureOptions {
  width?: number;
  height?: number;
  format?: 'image/png' | 'image/jpeg';
  quality?: number;
  cameraPreset?: CameraPresetId;
  /** Hide editor chrome (gizmos). */
  presentation?: boolean;
}

export interface SceneHandle {
  resetCamera: () => void;
  goToPreset: (preset: CameraPresetId) => void;
  captureFrame: (opts?: CaptureOptions) => Promise<Blob>;
}

function EnvironmentRig() {
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);
  const quality = useStore((s) => s.visual.quality);
  const q = resolveRenderQuality(quality);
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
    return Math.max(b.width, b.depth) * 1.1 + 80;
  }, [geom]);

  useLayoutEffect(() => {
    const light = lightRef.current;
    const t = targetRef.current;
    if (light && t) light.target = t;
    if (light?.shadow?.camera) {
      light.shadow.camera.layers.enable(0);
      light.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
    }
  }, []);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const size = q.shadowMapSize;
    if (light.shadow.mapSize.x !== size || light.shadow.mapSize.y !== size) {
      // Three won't rebuild the shadow RT unless the old one is cleared.
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.mapSize.set(size, size);
    }
    if (light.shadow.camera) {
      light.shadow.camera.layers.enable(0);
      light.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
    }
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
    light.shadow.autoUpdate = true;
  }, [q.shadowMapSize]);

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.needsUpdate = true;
  }, [quality]);

  const shadowFrame = useRef(0);
  useFrame(() => {
    const light = lightRef.current;
    if (!light) return;
    const everyN = q.shadowUpdateEveryN;
    if (everyN <= 1) {
      light.shadow.autoUpdate = true;
      return;
    }
    light.shadow.autoUpdate = false;
    shadowFrame.current += 1;
    const nightSlow = !isDaytime(timeOfDay) ? everyN * 2 : everyN;
    if (shadowFrame.current % nightSlow === 0) {
      light.shadow.needsUpdate = true;
    }
  });

  const ambientScale = 0.6;
  const sunScale = 1.05;
  const horizonFill = indoorHorizonFill(timeOfDay, orientationDeg);

  return (
    <>
      <hemisphereLight
        color={sun.skyColor}
        groundColor={sun.groundColor}
        intensity={
          (sun.ambient * (1 - IBL_AMBIENT_FRACTION) * mod.ambientMul * ambientScale +
            horizonFill * 0.12) *
          exposure
        }
      />
      <directionalLight
        ref={lightRef}
        position={sun.position}
        color={sun.color}
        intensity={sun.intensity * exposure * mod.sunMul * sunScale}
        castShadow
        shadow-mapSize={[q.shadowMapSize, q.shadowMapSize]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={Math.max(
          1600,
          Math.hypot(
            sun.position[0] - target[0],
            sun.position[1] - target[1],
            sun.position[2] - target[2],
          ) + shadowExtent,
        )}
        shadow-radius={0}
        shadow-normalBias={0.12}
        shadow-bias={-0.0002}
      />
      <object3D ref={targetRef} position={target} />
      <GrazingIndoorFill />
    </>
  );
}

function SoftShadowType() {
  const soft = useStore((s) => resolveRenderQuality(s.visual.quality).softShadows);
  const quality = useStore((s) => s.visual.quality);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.autoUpdate = true;
    gl.shadowMap.type = soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    gl.shadowMap.needsUpdate = true;
  }, [gl, soft, quality]);
  return null;
}

function ImageBasedLighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);
  const quality = useStore((s) => s.visual.quality);
  const q = resolveRenderQuality(quality);

  useEffect(() => {
    if (!q.ibl) {
      scene.environment = null;
      scene.environmentIntensity = 0;
      return;
    }
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
  }, [gl, scene, q.ibl]);

  const ambient = useMemo(
    () => sampleSun(timeOfDay, orientationDeg, planBounds(geom)).ambient,
    [timeOfDay, orientationDeg, geom],
  );
  const horizonFill = indoorHorizonFill(timeOfDay, orientationDeg);

  useEffect(() => {
    if (!q.ibl) {
      scene.environmentIntensity = 0;
      return;
    }
    scene.environmentIntensity =
      (ambient + horizonFill * 0.22) * exposure * IBL_INTENSITY_SCALE * 0.85;
  }, [scene, ambient, horizonFill, exposure, q.ibl]);

  useEffect(() => {
    if (!q.ibl) return;
    // Rotate the static RoomEnvironment so reflections roughly track room orientation.
    scene.environmentRotation?.set(0, THREE.MathUtils.degToRad(orientationDeg), 0);
  }, [scene, orientationDeg, q.ibl]);

  return null;
}

function AtmosphericFog() {
  const { scene, gl } = useThree();
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);
  const quality = useStore((s) => s.visual.quality);
  const proceduralSky = resolveRenderQuality(quality).proceduralSky;

  const bounds = useMemo(() => planBounds(geom), [geom]);

  const mod = useMemo(() => {
    const sun = sampleSun(timeOfDay, orientationDeg, bounds);
    return applyWeather(sun, weather, bounds);
  }, [timeOfDay, orientationDeg, weather, bounds]);

  useEffect(() => {
    if (skyMode === 'gradient') {
      // Low skips the Shader Sky — keep a solid backdrop so the void isn't black.
      if (proceduralSky) {
        scene.background = null;
        gl.setClearColor('#0a0e14');
      } else {
        scene.background = new THREE.Color(mod.skyBottom);
        gl.setClearColor(mod.skyBottom);
      }
    } else {
      scene.background = new THREE.Color(SCENE_BG);
      gl.setClearColor(SCENE_BG);
      scene.fog = null;
    }
  }, [skyMode, scene, gl, proceduralSky, mod.skyBottom]);

  useEffect(() => {
    if (skyMode !== 'gradient') return;
    // Fog is cheap visually but still a fragment cost — skip on Minimal env.
    if (!proceduralSky) {
      scene.fog = null;
      return;
    }
    if (mod.fog) {
      scene.fog = new THREE.Fog(mod.fog.color, mod.fog.near, mod.fog.far);
    } else {
      scene.fog = null;
    }
    return () => {
      scene.fog = null;
    };
  }, [skyMode, mod.fog, scene, proceduralSky]);

  return null;
}

function DprCap() {
  const quality = useStore((s) => s.visual.quality);
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    const cap = resolveRenderQuality(quality).dprCap;
    const device = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    setDpr(Math.min(device, cap));
  }, [quality, setDpr]);
  return null;
}

function ColorSpaceSetup() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
  }, [gl]);
  return null;
}

/** Downward indoor fill while the sun is up but too low to light sofa tops. */
function GrazingIndoorFill() {
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const exposure = useStore((s) => s.environment.exposure);
  const geom = useStore((s) => s.roomGeometry);
  const on = grazingSunIndoor(timeOfDay, orientationDeg);
  const [cx, cz] = planCentroid(geom);
  const b = planBounds(geom);
  if (!on) return null;
  const span = Math.max(b.width, b.depth);
  return (
    <>
      <hemisphereLight args={['#f4eee4', '#4a4338', 0.7 * exposure]} />
      <pointLight
        position={[cx, geom.height - 10, cz]}
        color="#fff3e4"
        intensity={36 * exposure}
        distance={span * 1.5}
        decay={1.15}
        castShadow={false}
      />
    </>
  );
}

/**
 * EffectComposer permanently sets gl.autoClear=false and restores that false
 * value after every frame. Force clear back on so the canvas never smears when
 * post is off — and so any offscreen passes that rely on autoClear still work.
 */
function AutoClearGuard() {
  const gl = useThree((s) => s.gl);

  useFrame(() => {
    gl.autoClear = true;
  }, -1);

  useEffect(() => {
    gl.autoClear = true;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
  }, [gl]);
  return null;
}

/** Animate orbit controls toward a framing. */
function CameraAnimator({
  controlsRef,
  requestRef,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  requestRef: MutableRefObject<{
    framing: ReturnType<typeof framingForPreset> | null;
    t: number;
  }>;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const fromPos = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const startFov = useRef(50);
  const animating = useRef(false);

  useFrame((_, dt) => {
    const req = requestRef.current;
    const ctrl = controlsRef.current;
    if (!req?.framing || !ctrl) {
      animating.current = false;
      return;
    }
    const f = req.framing;
    if (!animating.current) {
      animating.current = true;
      fromPos.current.copy(ctrl.object.position);
      fromTarget.current.copy(ctrl.target);
      toPos.current.set(...f.position);
      toTarget.current.set(...f.target);
      const cam = ctrl.object as THREE.PerspectiveCamera;
      startFov.current = 'fov' in cam ? cam.fov : 50;
      req.t = 0;
    }
    req.t = Math.min(1, req.t + dt * 2.2);
    const k = 1 - Math.pow(1 - req.t, 3);
    const cam = ctrl.object as THREE.PerspectiveCamera;
    cam.position.lerpVectors(fromPos.current, toPos.current, k);
    ctrl.target.lerpVectors(fromTarget.current, toTarget.current, k);
    if ('fov' in cam && typeof f.fov === 'number') {
      cam.fov = THREE.MathUtils.lerp(startFov.current, f.fov, k);
      cam.updateProjectionMatrix();
    }
    ctrl.update();
    invalidate();
    if (req.t >= 1) {
      req.framing = null;
      animating.current = false;
    }
  });
  return null;
}

type CaptureApi = {
  capture: (opts?: CaptureOptions) => Promise<Blob>;
  applyPreset: (preset: CameraPresetId) => void;
};

function CaptureBridge({
  apiRef,
  controlsRef,
}: {
  apiRef: MutableRefObject<CaptureApi | null>;
  controlsRef: RefObject<OrbitControlsType | null>;
}) {
  const { gl, scene, camera, size, invalidate } = useThree();
  const geom = useStore((s) => s.roomGeometry);

  const applyPreset = useCallback(
    (preset: CameraPresetId) => {
      const ctrl = controlsRef.current;
      if (!ctrl) return;
      const f = framingForPreset(geom, preset);
      ctrl.object.position.set(...f.position);
      ctrl.target.set(...f.target);
      const cam = ctrl.object as THREE.PerspectiveCamera;
      if ('fov' in cam) {
        cam.fov = f.fov;
        cam.updateProjectionMatrix();
      }
      ctrl.update();
    },
    [controlsRef, geom],
  );

  const capture = useCallback(
    async (opts: CaptureOptions = {}) => {
      const width = opts.width ?? 1920;
      const height = opts.height ?? 1080;
      const format = opts.format ?? 'image/png';
      const quality = opts.quality ?? 0.92;
      const prevSize = { w: size.width, h: size.height };
      const prevPR = gl.getPixelRatio();
      const ctrl = controlsRef.current;

      const prevCam = ctrl
        ? {
            pos: ctrl.object.position.clone(),
            target: ctrl.target.clone(),
            fov: (ctrl.object as THREE.PerspectiveCamera).fov,
          }
        : null;

      if (opts.presentation !== false) useStore.getState().setCaptureMode(true);
      if (opts.cameraPreset) applyPreset(opts.cameraPreset);

      gl.setPixelRatio(1);
      gl.setSize(width, height, false);

      // Let R3F + EffectComposer render (avoid raw gl.render which skips post FX).
      for (let i = 0; i < 3; i += 1) {
        invalidate();
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        gl.domElement.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode frame'))),
          format,
          quality,
        );
      });

      gl.setPixelRatio(prevPR);
      gl.setSize(prevSize.w, prevSize.h, false);
      useStore.getState().setCaptureMode(false);
      invalidate();

      if (ctrl && prevCam) {
        ctrl.object.position.copy(prevCam.pos);
        ctrl.target.copy(prevCam.target);
        const cam = ctrl.object as THREE.PerspectiveCamera;
        if ('fov' in cam) {
          cam.fov = prevCam.fov;
          cam.updateProjectionMatrix();
        }
        ctrl.update();
      }

      return blob;
    },
    [gl, scene, camera, size, controlsRef, applyPreset, invalidate],
  );

  useEffect(() => {
    apiRef.current = { capture, applyPreset };
  }, [apiRef, capture, applyPreset]);

  return null;
}

function SceneInner({
  controlsRef,
  apiRef,
  animRequestRef,
  readOnly,
  autoRotate,
  orbitCssTargetRef,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  apiRef: MutableRefObject<CaptureApi | null>;
  animRequestRef: MutableRefObject<{
    framing: ReturnType<typeof framingForPreset> | null;
    t: number;
  }>;
  readOnly: boolean;
  autoRotate: boolean;
  orbitCssTargetRef?: RefObject<HTMLElement | null>;
}) {
  const deselect = useStore((s) => s.select);
  const skyMode = useStore((s) => s.environment.skyMode);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const weather = useStore((s) => s.environment.weather);
  const geom = useStore((s) => s.roomGeometry);
  const quality = useStore((s) => s.visual.quality);
  const cameraPreset = useStore((s) => s.visual.cameraPreset);
  const capturing = useStore((s) => s.captureMode);
  const q = resolveRenderQuality(quality);

  const framing = useMemo(() => framingForPreset(geom, cameraPreset), [geom, cameraPreset]);

  const backdrop = useMemo(() => {
    if (skyMode === 'studio') return SCENE_BG;
    const sun = sampleSun(timeOfDay, orientationDeg, planBounds(geom));
    return applyWeather(sun, weather, planBounds(geom)).skyBottom;
  }, [skyMode, timeOfDay, orientationDeg, weather, geom]);

  const showChrome = !capturing && !readOnly;
  const showWeatherFx = q.envDetail === 'full';
  const cheapGpu = q.tier === 'low' || q.tier === 'balanced';
  const designerTool = useStore((s) => s.designerTool);
  const hangingTool =
    !readOnly && !capturing && (designerTool === 'hanging-leaves' || designerTool === 'hanging-lights');

  return (
    <Canvas
      frameloop="always"
      shadows
      dpr={[1, q.dprCap]}
      camera={{
        position: framing.position,
        fov: framing.fov,
        near: 1,
        far: 2000,
      }}
      onPointerMissed={() => {
        if (!readOnly) deselect(null);
      }}
      gl={{
        antialias: q.tier !== 'low',
        alpha: false,
        powerPreference: cheapGpu ? 'low-power' : 'default',
        toneMapping: THREE.ACESFilmicToneMapping,
        preserveDrawingBuffer: false,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(backdrop);
        scene.background = new THREE.Color(backdrop);
        gl.autoClear = true;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
        gl.shadowMap.autoUpdate = true;
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      }}
      style={{ width: '100%', height: '100%', background: backdrop }}
    >
      <ColorSpaceSetup />
      <AutoClearGuard />
      <SoftShadowType />
      <DprCap />
      <AtmosphericFog />
      <ImageBasedLighting />
      <EnvironmentRig />
      <ProceduralSky />
      {showWeatherFx ? <WeatherSystem /> : null}

      <Room />
      <ItemsLayer />
      {hangingTool ? (
        <>
          <HangingPlacementController />
          <HangingDraftPreview />
        </>
      ) : null}
      {showChrome && !hangingTool ? (
        <>
          <ObjectGizmo />
          <ArcMenu />
          <DragController />
          <KeyboardShortcuts />
        </>
      ) : null}
      <WindowLightShafts />
      <RoomVolumetricHaze />

      <ScenePostProcessing />
      <CameraAnimator controlsRef={controlsRef} requestRef={animRequestRef} />
      <CaptureBridge apiRef={apiRef} controlsRef={controlsRef} />
      {orbitCssTargetRef ? (
        <CameraOrbitSync controlsRef={controlsRef} targetRef={orbitCssTargetRef} />
      ) : null}

      <OrbitControls
        ref={controlsRef as never}
        target={framing.target}
        minDistance={60}
        maxDistance={650}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enableDamping
        dampingFactor={0.08}
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={0.55}
        // View-only rooms still need orbit navigation (pinch/scroll zoom + pan).
        enableZoom
        enablePan
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
  /** Slow orbit for marketing embeds. */
  autoRotate?: boolean;
  /** Host element for camera-orbit CSS vars (bedding sidebar tilt). */
  orbitCssTargetRef?: RefObject<HTMLElement | null>;
}

export const Scene = forwardRef<SceneHandle, SceneProps>(function Scene(
  { readOnly = false, autoRotate = false, orbitCssTargetRef },
  ref,
) {
  const controlsRef = useRef<OrbitControlsType>(null);
  const apiRef = useRef<CaptureApi | null>(null);
  const animRequestRef = useRef<{
    framing: ReturnType<typeof framingForPreset> | null;
    t: number;
  }>({ framing: null, t: 0 });
  const geom = useStore((s) => s.roomGeometry);
  const cameraPreset = useStore((s) => s.visual.cameraPreset);

  useImperativeHandle(
    ref,
    () => ({
      resetCamera() {
        const f = framingForPreset(geom, cameraPreset);
        const ctrl = controlsRef.current;
        if (!ctrl) return;
        ctrl.object.position.set(...f.position);
        ctrl.target.set(...f.target);
        const cam = ctrl.object as THREE.PerspectiveCamera;
        if ('fov' in cam) {
          cam.fov = f.fov;
          cam.updateProjectionMatrix();
        }
        ctrl.update();
      },
      goToPreset(preset: CameraPresetId) {
        animRequestRef.current = {
          framing: framingForPreset(geom, preset),
          t: 0,
        };
        useStore.getState().setCameraPreset(preset);
      },
      async captureFrame(opts?: CaptureOptions) {
        const api = apiRef.current;
        if (!api) throw new Error('Scene not ready');
        return api.capture(opts);
      },
    }),
    [geom, cameraPreset],
  );

  return (
    <SceneInner
      controlsRef={controlsRef}
      apiRef={apiRef}
      animRequestRef={animRequestRef}
      readOnly={readOnly}
      autoRotate={autoRotate}
      orbitCssTargetRef={orbitCssTargetRef}
    />
  );
});
