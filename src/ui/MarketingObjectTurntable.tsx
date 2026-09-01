import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MARKETING_SHOWCASE } from '../lib/marketingShowcase';
import { publicModelAssetUrl } from '../lib/modelStorage';
import { normalizeImportedMaterials } from '../lib/normalizeImportedMaterials';
import { MonoMeta, Spinner } from './kit';

const ARMCHAIR_URL = publicModelAssetUrl(MARKETING_SHOWCASE.object.modelPath);
const STEP_CHAIR_URL = publicModelAssetUrl(MARKETING_SHOWCASE.stepChair.modelPath);

function TransparentClear() {
  const { gl } = useThree();
  useEffect(() => {
    gl.setClearColor(0x000000, 0);
  }, [gl]);
  return null;
}

/** Release the WebGL context when leaving the landing page (mobile context budget). */
function DisposeGlOnUnmount() {
  const { gl } = useThree();
  useEffect(() => {
    return () => {
      gl.dispose();
    };
  }, [gl]);
  return null;
}

function ShowcaseModel({ url, compact = false }: { url: string; compact?: boolean }) {
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

    const targetSize = compact ? 20 : 26;
    const maxDim = Math.max(size.x, size.y, size.z, 1e-3);
    cloned.scale.setScalar(targetSize / maxDim);
    return cloned;
  }, [compact, scene]);

  return <primitive object={object} />;
}

export interface MarketingObjectTurntableProps {
  url?: string | null;
  className?: string;
  compact?: boolean;
}

/** Static public/marketing GLB turntable (not Supabase Storage). */
export function MarketingObjectTurntable({
  url = ARMCHAIR_URL,
  className,
  compact = false,
}: MarketingObjectTurntableProps) {
  useEffect(() => {
    if (url) useGLTF.preload(url);
  }, [url]);

  if (!url) {
    return (
      <div className="landing-object-fallback">
        <MonoMeta size="sm" tone="dense">
          Model unavailable
        </MonoMeta>
      </div>
    );
  }

  return (
    <div
      className={['landing-object-turntable', compact ? 'landing-object-turntable--compact' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-label="Drag to rotate the 3D model"
    >
      <Suspense
        fallback={
          <div className="landing-object-fallback">
            <Spinner label="Loading model…" />
          </div>
        }
      >
        <Canvas
          camera={
            compact
              ? { position: [50, 23, 58], fov: 32 }
              : { position: [38, 24, 44], fov: 30 }
          }
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
            powerPreference: 'low-power',
          }}
          style={{ background: 'transparent', width: '100%', height: '100%' }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <TransparentClear />
          <DisposeGlOnUnmount />
          <ambientLight intensity={0.55} />
          <directionalLight position={[36, 48, 24]} intensity={1.05} />
          <directionalLight position={[-28, 18, -16]} intensity={0.35} color="#B05A3C" />
          <Environment preset="apartment" environmentIntensity={0.35} />
          <ShowcaseModel url={url} compact={compact} />
          <ContactShadows
            position={[0, 0.01, 0]}
            opacity={0.28}
            scale={48}
            blur={2.4}
            far={40}
          />
          <OrbitControls
            target={compact ? [0, 10, 0] : [0, 11, 0]}
            enablePan={false}
            enableZoom={false}
            autoRotate
            autoRotateSpeed={0.55}
            enableDamping
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

export { STEP_CHAIR_URL };
