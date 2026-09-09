import { GlbTurntablePreview } from './GlbTurntablePreview';
import { MonoMeta } from './kit';

export interface GlbRevisionCompareProps {
  beforeUrl: string | null;
  afterUrl: string | null;
  compact?: boolean;
  className?: string;
}

export function GlbRevisionCompare({
  beforeUrl,
  afterUrl,
  compact = false,
  className,
}: GlbRevisionCompareProps) {
  if (!beforeUrl || !afterUrl) return null;

  return (
    <div className={['glb-revision-compare', className].filter(Boolean).join(' ')}>
      <MonoMeta size="xs" tone="subtle" style={{ display: 'block', marginBottom: 8 }}>
        BEFORE / AFTER
      </MonoMeta>
      <div className="glb-revision-compare__grid">
        <div className="glb-revision-compare__col">
          <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginBottom: 6 }}>
            Before
          </MonoMeta>
          <GlbTurntablePreview url={beforeUrl} compact={compact} enableZoom autoRotate={false} />
        </div>
        <div className="glb-revision-compare__col">
          <MonoMeta size="xs" tone="dense" style={{ display: 'block', marginBottom: 6 }}>
            After
          </MonoMeta>
          <GlbTurntablePreview url={afterUrl} compact={compact} enableZoom autoRotate={false} />
        </div>
      </div>
    </div>
  );
}
