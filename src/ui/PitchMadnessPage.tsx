import { useEffect, useRef, useState } from 'react';
import { JUST_WEB_DEMO_URL, MOBILE_DEMO_URL, TWO_D_THREE_D_DEMO_URL, DemoVideoModal } from './DemoVideoModal';
import {
  Button,
  DisplayEm,
  DisplayHeading,
  Eyebrow,
  Footer,
  MarketingNav,
  MonoMeta,
  RuledList,
  SectionOpener,
} from './kit';

interface PitchMadnessPageProps {
  onGoHome: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
  onContact: () => void;
  onAdmin?: () => void;
  loggedIn?: boolean;
  onGoDashboard?: () => void;
  scrollToDemosOnMount?: boolean;
  onDemosScrolled?: () => void;
}

const MVP_DONE = [
  { index: '01', label: 'Design your dorm' },
  { index: '02', label: 'Place products in your room' },
  { index: '03', label: 'Visualize before buying' },
];

const MVP_COMING = [
  { index: '01', label: 'AI room recommendations' },
  { index: '02', label: 'Product bundles' },
  { index: '03', label: 'Cross-store shopping' },
  { index: '04', label: 'Personalized shopping assistant' },
];

const BOOTH_PERKS = [
  'Live demo',
  'Rubber ducks',
  'Free candy',
  'Meet the team',
  'Try Toova yourself',
];

const DEMOS = [
  {
    id: '2d-3d',
    badge: '2D → 3D',
    url: TWO_D_THREE_D_DEMO_URL,
    caption: 'Upload a product photo and watch AI turn it into an interactive 3D model.',
    mobile: false,
  },
  {
    id: 'web',
    badge: 'Web',
    url: JUST_WEB_DEMO_URL,
    caption: 'Design your dorm, place furniture, and visualize your space on desktop.',
    mobile: false,
  },
  {
    id: 'mobile',
    badge: 'Mobile / AR',
    url: MOBILE_DEMO_URL,
    caption: 'View your room in augmented reality on iPhone.',
    mobile: true,
  },
] as const;

function DemoCard({
  demo,
  onFullScreen,
}: {
  demo: (typeof DEMOS)[number];
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
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
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
        <video src={demo.url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
      </div>
      <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', margin: '14px 0 0' }}>{demo.caption}</p>
    </div>
  );
}

export function PitchMadnessPage({
  onGoHome,
  onGetStarted,
  onLogin,
  onContact,
  onAdmin,
  loggedIn,
  onGoDashboard,
  scrollToDemosOnMount,
  onDemosScrolled,
}: PitchMadnessPageProps) {
  const [modalVideo, setModalVideo] = useState<string | null>(null);
  const demosRef = useRef<HTMLElement>(null);

  const landscapeDemos = DEMOS.filter((d) => !d.mobile);
  const mobileDemo = DEMOS.find((d) => d.mobile);

  const scrollToDemos = () => {
    demosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!scrollToDemosOnMount) return;
    const timer = window.setTimeout(() => {
      scrollToDemos();
      onDemosScrolled?.();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [scrollToDemosOnMount, onDemosScrolled]);

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;
  const primaryLabel = loggedIn ? 'Go to dashboard' : 'Try Toova';

  return (
    <div className="toova-page">
      <div className="toova-paper" aria-hidden />
      <MarketingNav
        brandOnClick={onGoHome}
        cta={
          <>
            {!loggedIn ? (
              <Button size="sm" variant="mono" onClick={secondaryAction}>
                Log in
              </Button>
            ) : null}
            <Button size="sm" onClick={primaryAction}>
              {primaryLabel}
            </Button>
          </>
        }
      />

      <div className="toova-frame" style={{ paddingTop: 104 }}>
        <Eyebrow level="page" style={{ marginBottom: 40 }}>
          Pitch Madness 2026
        </Eyebrow>
        <DisplayHeading level={3}>
          Welcome,
          <br />
          judges.
        </DisplayHeading>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 48,
            marginTop: 48,
            paddingBottom: 36,
            borderBottom: '1px solid var(--rule-heavy)',
            flexWrap: 'wrap',
          }}
        >
          <p style={{ font: 'var(--type-lead)', color: 'var(--ink-2)', margin: 0, maxWidth: 'var(--measure-lead)' }}>
            The pitch only scratched the surface. Here is the problem, the product, and where we are headed.
          </p>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Button size="md" onClick={scrollToDemos}>
              See demo
            </Button>
            <Button variant="mono" onClick={primaryAction}>
              {primaryLabel} →
            </Button>
          </div>
        </div>
      </div>

      <div className="toova-frame" style={{ paddingTop: 96 }}>
        <div className="toova-grid-two" style={{ gap: 'var(--col-gap-wide)', borderTop: '1px solid var(--rule-heavy)' }}>
          <article style={{ paddingTop: 28 }}>
            <Eyebrow style={{ marginBottom: 16 }}>The problem</Eyebrow>
            <DisplayHeading level={5} style={{ marginBottom: 18 }}>
              Buying confidently isn&apos;t.
            </DisplayHeading>
            <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: 0 }}>
              Shoppers spend on products they have never stood next to. When it doesn&apos;t fit, it comes back —
              costing time, money, and landfill space.
            </p>
          </article>
          <article style={{ paddingTop: 28 }}>
            <Eyebrow style={{ marginBottom: 16 }}>Our solution</Eyebrow>
            <DisplayHeading level={5} style={{ marginBottom: 18 }}>
              Experience it first.
            </DisplayHeading>
            <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: '0 0 20px' }}>
              AI, 3D, and AR let shoppers place products in their own rooms before checkout.
            </p>
            <RuledList
              columns={1}
              items={[
                { index: '01', label: 'Better purchasing decisions' },
                { index: '02', label: 'Fewer returns' },
                { index: '03', label: 'Happier customers' },
              ]}
            />
          </article>
        </div>
      </div>

      <div
        style={{
          background: 'var(--bg-inverse)',
          color: 'var(--text-on-inverse)',
          position: 'relative',
          overflow: 'hidden',
          marginTop: 96,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '-10%',
            opacity: 0.4,
            background: 'var(--texture-grain)',
            animation: 'toova-drift var(--dur-ambient) linear infinite alternate',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            maxWidth: 'var(--page-max)',
            margin: '0 auto',
            padding: '80px var(--page-gutter)',
          }}
        >
          <Eyebrow tone="inverse" style={{ marginBottom: 28 }}>
            Why students?
          </Eyebrow>
          <DisplayHeading level={4} inverse style={{ marginBottom: 24, maxWidth: 720 }}>
            We know this problem firsthand.
          </DisplayHeading>
          <p style={{ font: 'var(--type-body)', color: 'var(--cream-2)', margin: 0, maxWidth: 640 }}>
            Students move often. Rooms are small. Budgets are tight. Student housing is the clearest place to
            build and validate first.
          </p>
        </div>
      </div>

      <div className="toova-frame" style={{ paddingTop: 96 }}>
        <SectionOpener title="What you can try." note="Today · coming soon" />
        <div className="toova-grid-two" style={{ gap: 'var(--col-gap-wide)', paddingTop: 36 }}>
          <div>
            <MonoMeta size="sm" upper tone="dense" style={{ marginBottom: 16, display: 'block' }}>
              Today
            </MonoMeta>
            <RuledList columns={1} items={MVP_DONE} />
          </div>
          <div>
            <MonoMeta size="sm" upper tone="dense" style={{ marginBottom: 16, display: 'block' }}>
              Coming soon
            </MonoMeta>
            <RuledList columns={1} items={MVP_COMING} />
          </div>
        </div>
        <div style={{ marginTop: 36 }}>
          <Button size="md" onClick={primaryAction}>
            {primaryLabel}
          </Button>
        </div>
      </div>

      <section id="pitch-demos" ref={demosRef} className="toova-frame" style={{ paddingTop: 104 }}>
        <SectionOpener title="See it in action." note="2D → 3D · web · AR" />
        <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: '24px 0 40px', maxWidth: 540 }}>
          Turn photos into 3D models, design on the web, then see it in AR on your phone.
        </p>
        <div className="pitch-demos-layout">
          <div>
            {landscapeDemos.map((demo) => (
              <DemoCard key={demo.id} demo={demo} onFullScreen={setModalVideo} />
            ))}
          </div>
          {mobileDemo ? <DemoCard demo={mobileDemo} onFullScreen={setModalVideo} /> : null}
        </div>
      </section>

      <div className="toova-frame" style={{ paddingTop: 96 }}>
        <Eyebrow style={{ marginBottom: 28 }}>Our vision</Eyebrow>
        <DisplayHeading level={4} style={{ marginBottom: 28, maxWidth: 720 }}>
          Own it before you <DisplayEm>buy</DisplayEm> it.
        </DisplayHeading>
        <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: 0, maxWidth: 560 }}>
          Online shopping has barely changed in decades. We are building the assistant that helps people decide
          before, during, and after every purchase.
        </p>
      </div>

      <div className="toova-frame" style={{ paddingTop: 96, paddingBottom: 24 }}>
        <SectionOpener title="Stop by the booth." note="Pitch Madness" />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px 32px',
            paddingTop: 28,
            borderTop: '1px solid var(--rule-hair)',
            marginTop: 8,
          }}
        >
          {BOOTH_PERKS.map((text) => (
            <MonoMeta key={text} size="md" tone="default">
              {text}
            </MonoMeta>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 36, flexWrap: 'wrap' }}>
          <Button size="md" onClick={scrollToDemos}>
            See demo
          </Button>
          <Button variant="mono" onClick={primaryAction}>
            {primaryLabel} →
          </Button>
        </div>
      </div>

      <Footer
        links={[
          { label: 'Contact', onClick: onContact },
          { label: 'Privacy' },
          { label: 'Terms' },
          ...(onAdmin ? [{ label: 'Admin', onClick: onAdmin }] : []),
        ]}
      />

      <DemoVideoModal open={!!modalVideo} src={modalVideo ?? undefined} onClose={() => setModalVideo(null)} />
    </div>
  );
}
