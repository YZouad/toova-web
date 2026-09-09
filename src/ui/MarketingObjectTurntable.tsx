import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { MARKETING_SHOWCASE } from '../lib/marketingShowcase';
import { publicModelAssetUrl } from '../lib/modelStorage';
import { GlbTurntablePreview } from './GlbTurntablePreview';

const ARMCHAIR_URL = publicModelAssetUrl(MARKETING_SHOWCASE.object.modelPath);
const STEP_CHAIR_URL = publicModelAssetUrl(MARKETING_SHOWCASE.stepChair.modelPath);

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

  return (
    <GlbTurntablePreview
      url={url}
      className={['landing-object-turntable', compact ? 'landing-object-turntable--compact' : '', className]
        .filter(Boolean)
        .join(' ')}
      compact={compact}
      enableZoom={false}
      autoRotate
    />
  );
}

export { STEP_CHAIR_URL };
