import { useEffect, useRef } from 'react';
import { DemoShowcase } from './DemoShowcase';
import {
  Button,
  DisplayEm,
  DisplayHeading,
  Eyebrow,
  Footer,
  MarketingNav,
  MarketingNavAuthActions,
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
  const demosRef = useRef<HTMLElement>(null);

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
          <MarketingNavAuthActions
            loggedIn={loggedIn}
            onLogin={secondaryAction}
            onPrimary={primaryAction}
            primaryLong="Try Toova"
            primaryShort="Try free"
          />
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

      <DemoShowcase
        id="pitch-demos"
        sectionRef={demosRef}
        style={{ paddingTop: 104 }}
      />

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
    </div>
  );
}
