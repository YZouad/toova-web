import { useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { DemoVideoModal } from './DemoVideoModal';
import { DEMOS, type DemoVideo } from './demoVideos';
import { Button, DisplayHeading, MonoMeta, SectionOpener, type DisplayLevel } from './kit';

function DemoCard({
  demo,
  onFullScreen,
}: {
  demo: DemoVideo;
  onFullScreen: (url: string) => void;
}) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--rule-heavy)',
        paddingTop: 20,
        marginBottom: 32,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 14,
        }}
      >
        <MonoMeta size="sm" upper tone="dense">
          {demo.badge}
        </MonoMeta>
        <Button variant="mono" onClick={() => onFullScreen(demo.url)}>
          Full screen →
        </Button>
      </div>
      <div
        style={{
          background: 'var(--bg-plate)',
          border: '1px solid var(--rule-soft)',
          overflow: 'hidden',
          aspectRatio: demo.mobile ? '9 / 16' : '16 / 9',
          maxWidth: demo.mobile ? 280 : '100%',
        }}
      >
        <video
          src={demo.url}
          controls
          playsInline
          preload="metadata"
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
        />
      </div>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', margin: '14px 0 0' }}>
        {demo.caption}
      </p>
    </div>
  );
}

export interface DemoShowcaseProps {
  id?: string;
  sectionRef?: RefObject<HTMLElement | null>;
  title?: string;
  note?: string;
  intro?: string;
  headingLevel?: DisplayLevel;
  variant?: 'default' | 'embedded';
  className?: string;
  style?: CSSProperties;
}

export function DemoShowcase({
  id,
  sectionRef,
  title = 'See it in action.',
  note = '2D → 3D · web · AR',
  intro = 'Turn photos into 3D models, design on the web, then see it in AR on your phone.',
  headingLevel = 4,
  variant = 'default',
  className,
  style,
}: DemoShowcaseProps) {
  const [modalVideo, setModalVideo] = useState<string | null>(null);
  const landscapeDemos = DEMOS.filter((d) => !d.mobile);
  const mobileDemo = DEMOS.find((d) => d.mobile);
  const embedded = variant === 'embedded';
  const sectionClass = [embedded ? 'demo-showcase--embedded' : 'toova-frame', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section id={id} ref={sectionRef as Ref<HTMLElement>} className={sectionClass} style={style}>
      {embedded ? (
        <div className="demo-showcase__embedded-header">
          {note ? (
            <MonoMeta size="sm" upper tone="dense" className="demo-showcase__embedded-note">
              {note}
            </MonoMeta>
          ) : null}
          <DisplayHeading level={headingLevel}>{title}</DisplayHeading>
        </div>
      ) : (
        <SectionOpener title={title} note={note} level={headingLevel} />
      )}
      {intro ? (
        <p
          className="demo-showcase__intro"
          style={
            embedded
              ? undefined
              : { font: 'var(--type-body)', color: 'var(--ink-2)', margin: '24px 0 40px', maxWidth: 540 }
          }
        >
          {intro}
        </p>
      ) : null}
      <div className="pitch-demos-layout">
        <div>
          {landscapeDemos.map((demo) => (
            <DemoCard key={demo.id} demo={demo} onFullScreen={setModalVideo} />
          ))}
        </div>
        {mobileDemo ? <DemoCard demo={mobileDemo} onFullScreen={setModalVideo} /> : null}
      </div>
      <DemoVideoModal open={!!modalVideo} src={modalVideo ?? undefined} onClose={() => setModalVideo(null)} />
    </section>
  );
}
