import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { MARKETING_SHOWCASE } from '../lib/marketingShowcase';
import { signBrowsableModelPath } from '../lib/modelStorage';
import { normalizeImportedMaterials } from '../lib/normalizeImportedMaterials';
import { MonoMeta, Spinner } from './kit';

function TransparentClear() {
  const { gl } = useThree();
  useEffect(() => {
    gl.setClearColor(0x000000, 0);
  }, [gl]);
  return null;
}

function ArmChairModel({ url }: { url: string }) {
  const { scene } = useGLTF(url) as { scene: THREE.Object3D };

  const object = useMemo(() => {
    const cloned = scene.clone(true);
    normalizeImportedMaterials(cloned, { relight: true });
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    cloned.position.set(-center.x, -box.min.y, -center.z);

    const target = 26;
    const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
    cloned.scale.setScalar(target / maxDim);
    return cloned;
  }, [scene]);

  return <primitive object={object} />;
}

/** Hero slogan turntable: public catalog Arm Chair on a transparent canvas. */
export function MarketingObjectTurntable() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const signed = await signBrowsableModelPath(MARKETING_SHOWCASE.object.modelPath);
      if (cancelled) return;
      if (!signed) {
        setError('Model unavailable');
        return;
      }
      useGLTF.preload(signed);
      setUrl(signed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="landing-object-fallback">
        <MonoMeta size="sm" tone="dense">
          {error}
        </MonoMeta>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="landing-object-fallback">
        <Spinner label="Loading model…" />
      </div>
    );
  }

  return (
    <div className="landing-object-turntable">
      <Suspense
        fallback={
          <div className="landing-object-fallback">
            <Spinner label="Loading model…" />
          </div>
        }
      >
        <Canvas
          camera={{ position: [38, 24, 44], fov: 30 }}
          gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
          style={{ background: 'transparent', width: '100%', height: '100%' }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <TransparentClear />
          <ambientLight intensity={0.55} />
          <directionalLight position={[36, 48, 24]} intensity={1.05} />
          <directionalLight position={[-28, 18, -16]} intensity={0.35} color="#B05A3C" />
          <Environment preset="apartment" environmentIntensity={0.35} />
          <ArmChairModel url={url} />
          <ContactShadows
            position={[0, 0.01, 0]}
            opacity={0.28}
            scale={48}
            blur={2.4}
            far={40}
          />
          <OrbitControls
            target={[0, 11, 0]}
            enablePan={false}
            enableZoom={false}
            autoRotate
            autoRotateSpeed={0.45}
            enableDamping
          />
        </Canvas>
      </Suspense>
    </div>
  );
}
