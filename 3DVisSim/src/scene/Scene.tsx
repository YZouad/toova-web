import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { ROOM } from '../units';
import { Room } from './Room';
import { ItemsLayer } from '../furniture/ItemsLayer';
import { DragController } from '../interaction/DragController';
import { KeyboardShortcuts } from '../interaction/KeyboardShortcuts';
import { useStore } from '../store';

export function Scene() {
  const deselect = useStore((s) => s.select);

  return (
    <Canvas
      shadows
      camera={{
        position: [ROOM.width / 2 + 180, 140, ROOM.depth / 2 + 240],
        fov: 35,
        near: 1,
        far: 2000,
      }}
      onPointerMissed={() => deselect(null)}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#2a2a2a']} />

      <hemisphereLight args={['#ffffff', '#444444', 0.6]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[ROOM.width / 2, 200, ROOM.depth + 200]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-near={1}
        shadow-camera-far={800}
      />

      <Grid
        position={[ROOM.width / 2, 0.1, ROOM.depth / 2]}
        args={[ROOM.width, ROOM.depth]}
        cellSize={12}
        cellThickness={0.6}
        cellColor="#6a543a"
        sectionSize={60}
        sectionThickness={1.2}
        sectionColor="#8a6e4e"
        fadeDistance={500}
        infiniteGrid={false}
      />

      <Room />
      <ItemsLayer />
      <DragController />
      <KeyboardShortcuts />

      <OrbitControls
        target={[ROOM.width / 2, 30, ROOM.depth / 2]}
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
