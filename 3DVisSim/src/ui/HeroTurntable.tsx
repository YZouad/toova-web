import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';

function RotatingChair() {
  const group = useRef<THREE.Group>(null);
  return (
    <group ref={group} position={[0, -8, 0]}>
      <mesh position={[0, 14, 0]} castShadow>
        <boxGeometry args={[28, 4, 24]} />
        <meshStandardMaterial color="#CBB28F" />
      </mesh>
      <mesh position={[0, 28, -8]} castShadow>
        <boxGeometry args={[28, 24, 4]} />
        <meshStandardMaterial color="#B05A3C" />
      </mesh>
      <mesh position={[-10, 6, 0]} castShadow>
        <boxGeometry args={[4, 12, 20]} />
        <meshStandardMaterial color="#A98A60" />
      </mesh>
      <mesh position={[10, 6, 0]} castShadow>
        <boxGeometry args={[4, 12, 20]} />
        <meshStandardMaterial color="#A98A60" />
      </mesh>
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[24, 4, 20]} />
        <meshStandardMaterial color="#8a6b4a" />
      </mesh>
    </group>
  );
}

export function HeroTurntable() {
  return (
    <Canvas
      className="landing-hero-canvas"
      camera={{ position: [60, 40, 80], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[40, 60, 30]} intensity={1.2} />
      <pointLight position={[-30, 20, -20]} intensity={0.4} color="#B05A3C" />
      <RotatingChair />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={1.4} enableDamping />
    </Canvas>
  );
}
