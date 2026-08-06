import { useRef, useState } from 'react';
import { useChecklistModal } from '../hooks/useChecklistModal';
import { ChecklistModal } from './ChecklistModal';
import { FeedbackModal } from './FeedbackModal';
import { HeroTurntable } from './HeroTurntable';
import { MarketingObjectTurntable } from './MarketingObjectTurntable';
import {
  Button,
  DisplayEm,
  DisplayHeading,
  Eyebrow,
  Footer,
  KeyValueRow,
  MarketingNav,
  NumberedStep,
  PlateCard,
  PriceColumn,
  RuledList,
  SectionOpener,
  StatRow,
} from './kit';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onPitchMadness: () => void;
  onWatchDemo: () => void;
  onOpenChecklist: () => void;
  onContact: () => void;
  onAdmin?: () => void;
  loggedIn?: boolean;
  onGoDashboard?: () => void;
}

const STEPS = [
  {
    numeral: '01',
    title: 'Find a product',
    body: 'Upload a photo from any store page, or browse the pieces we already support. One clear image is enough.',
    plateCaption: 'step-01.png',
  },
  {
    numeral: '02',
    title: 'Get a 3D model',
    body: 'The photo becomes a solid object, reconstructed to real-world scale, in about thirty seconds.',
    plateCaption: 'step-02.png',
  },
  {
    numeral: '03',
    title: 'Design the space',
    body: 'Arrange it against the real walls of your room: windows, doors, radiators, the closet that opens the wrong way.',
    plateCaption: 'step-03.png',
  },
  {
    numeral: '04',
    title: 'Then buy it',
    body: 'Check out from the room you designed, with the running total in front of you. Once, and keep it.',
    plateCaption: 'step-04.png',
  },
] as const;

const FUTURE = [
  { index: '01', label: 'Personalized recommendations' },
  { index: '02', label: 'Smart bundle suggestions' },
  { index: '03', label: 'Live shopping carts' },
  { index: '04', label: 'Return assistance' },
  { index: '05', label: 'Subscription reminders' },
  { index: '06', label: 'Address management' },
  { index: '07', label: 'Price tracking' },
  { index: '08', label: 'Room-aware suggestions' },
];

const VALUES: [string, string][] = [
  ['Customer first', 'Shopping should feel exciting, not stressful. Every screen has to earn its place on the page.'],
  ['Sustainability', 'Better decisions mean fewer trucks, fewer boxes, and less in the landfill.'],
  ['Trust', 'Your shopping data is yours. Transparent, secure, and never the product.'],
  ['Innovation', 'Spatial tools belong to shoppers, not only to architects and studios.'],
];

export function LandingPage({
  onGetStarted,
  onLogin,
  onPitchMadness,
  onWatchDemo,
  onOpenChecklist,
  onContact,
  onAdmin,
  loggedIn,
  onGoDashboard,
}: LandingPageProps) {
  const { open: checklistOpen, closeChecklist } = useChecklistModal();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const howRef = useRef<HTMLDivElement>(null);
  const roomsRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;

  return (
    <div className="toova-page">
      <div className="toova-paper" aria-hidden />
      <ChecklistModal open={checklistOpen} onClose={closeChecklist} onViewChecklist={onOpenChecklist} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} pageSource="landing" />

      <MarketingNav
        cta={
          <>
            {!loggedIn ? (
              <Button size="sm" variant="mono" onClick={secondaryAction}>
                Log in
              </Button>
            ) : null}
            <Button size="sm" onClick={primaryAction}>
              {loggedIn ? 'Go to dashboard' : 'Start designing, free'}
            </Button>
          </>
        }
      />

      {/* Hero */}
      <div className="toova-frame landing-hero-pad">
        <div className="landing-hero-slogan">
          <div className="landing-hero-slogan__copy">
            <Eyebrow level="page" style={{ marginBottom: 40 }}>
              Toova — a room planner for people about to spend money
            </Eyebrow>
            <DisplayHeading level={1}>
              Own it
              <br />
              <span className="landing-hero-nowrap">before you</span>
              <br />
              <DisplayEm>buy</DisplayEm> it.
            </DisplayHeading>
          </div>
          <div className="landing-hero-slogan__object" aria-hidden={false}>
            <MarketingObjectTurntable />
          </div>
        </div>
        <div className="landing-hero-lead">
          <p style={{ font: 'var(--type-lead)', color: 'var(--ink-2)', margin: 0, maxWidth: 'var(--measure-lead)' }}>
            Turn a product photo into a 3D model, place it in your real room at real scale, and buy only what fits.
          </p>
          <div className="landing-hero-actions">
            <Button variant="primary" size="lg" onClick={primaryAction}>
              {loggedIn ? 'Go to dashboard' : 'Start designing, free'}
            </Button>
            <Button variant="mono" onClick={loggedIn && onGoDashboard ? onGoDashboard : onWatchDemo}>
              {loggedIn ? 'My rooms →' : '40-second demo →'}
            </Button>
            <Button
              variant="mono"
              onClick={() => {
                closeChecklist();
                onOpenChecklist();
              }}
            >
              Checklist →
            </Button>
          </div>
        </div>
        <StatRow
          style={{ paddingTop: 20 }}
          items={['Photo → 3D in 32.4s', '18 categories', '24 measured dorm plans', 'Free for five rooms']}
        />
      </div>

      {/* Hero visual — live turntable kept as the product visual */}
      <div className="toova-frame" style={{ marginTop: 64 }}>
        <div className="landing-hero-visual">
          <HeroTurntable />
        </div>
      </div>

      {/* What is Toova */}
      <div className="toova-frame landing-section-pad">
        <div className="toova-grid-label-prose">
          <div>
            <Eyebrow style={{ marginBottom: 16 }}>What is Toova</Eyebrow>
            <DisplayHeading level={5}>Experience products before buying them.</DisplayHeading>
          </div>
          <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: 0 }}>
            Every year millions of people buy furniture and decor without knowing whether it fits their space or
            their life. What follows is predictable: expensive returns, buyer&apos;s regret, weeks of wasted time,
            and a landfill full of things that were only ever a guess.
          </p>
          <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: 0 }}>
            Toova turns any product into an interactive 3D model you can place inside your own room, at real scale.
            We started with student housing: dorm move-in is a dozen expensive decisions in a single week, and
            we&apos;re building toward every online purchase.
          </p>
        </div>
      </div>

      {/* Four steps */}
      <div className="toova-frame landing-section-pad" ref={howRef}>
        <SectionOpener id="how" title="Four steps." note="find  →  3D  →  design  →  buy" />
        <div className="toova-grid-four">
          {STEPS.map((step, i) => (
            <NumberedStep
              key={step.numeral}
              edge={i === 0 ? 'first' : i === STEPS.length - 1 ? 'last' : undefined}
              divider={i !== STEPS.length - 1}
              numeral={step.numeral}
              title={step.title}
              body={step.body}
              plateCaption={step.plateCaption}
            />
          ))}
        </div>
      </div>

      {/* Dark band */}
      <div id="why" ref={whyRef} className="landing-dark-band">
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
        <div className="landing-dark-band__inner">
          <Eyebrow tone="inverse" style={{ marginBottom: 40 }}>
            Why we&apos;re building Toova
          </Eyebrow>
          <DisplayHeading level={3} inverse style={{ marginBottom: 56, maxWidth: 1000 }}>
            The best return is the one that never happens.
          </DisplayHeading>
          <div className="landing-dark-band__grid">
            <p style={{ font: 'var(--type-body)', color: 'var(--cream-2)', margin: 0 }}>
              Hundreds of billions of dollars of goods come back every year, and a great deal of it is never resold.
              Most of those purchases were guesses made on a product page, and the cost of the guess is paid twice:
              once by you, once by the landfill.
            </p>
            <p style={{ font: 'var(--type-body)', color: 'var(--cream-2)', margin: 0 }}>
              We started with student housing because it is the clearest version of the problem. Moving into a dorm
              means a dozen expensive purchases in a few weeks, made remotely, for a room you have never stood in.
            </p>
            <div>
              <KeyValueRow inverse label="Real UChicago dorm plans" value="TODAY" valueTone="accent" />
              <KeyValueRow inverse label="Apartments and first homes" value="NEXT" />
              <KeyValueRow inverse label="Every online purchase" value="THE POINT" last />
            </div>
          </div>
        </div>
      </div>

      {/* Rooms */}
      <div className="toova-frame landing-section-pad" ref={roomsRef}>
        <SectionOpener id="rooms" title="Rooms, planned first." note="Browse all rooms" noteOnClick={primaryAction} />
        <div className="toova-grid-2-responsive" style={{ paddingTop: 32 }}>
          <PlateCard name="Sunlit Living Room" author="Maya Chen" meta="9 pieces · $1,240" filename="living-01.jpg" />
          <PlateCard name="Reading Nook" author="Devin Park" meta="6 pieces · $580" filename="nook-02.jpg" />
        </div>
      </div>

      {/* Future */}
      <div className="toova-frame landing-future landing-section-pad">
        <div className="landing-future__grid">
          <div className="landing-future__intro">
            <Eyebrow style={{ marginBottom: 16 }}>The future of shopping</Eyebrow>
            <DisplayHeading level={5} style={{ marginBottom: 18 }}>
              One platform.
              <br />
              Every purchase.
            </DisplayHeading>
            <p style={{ font: 'var(--type-body-sm)', color: 'var(--ink-4)', margin: 0, maxWidth: 340 }}>
              The room planner is the first piece. What we&apos;re building stays with you through the whole purchase.
            </p>
          </div>
          <RuledList columns={2} items={FUTURE} />
        </div>
      </div>

      {/* Values */}
      <div className="toova-frame landing-section-pad">
        <Eyebrow style={{ marginBottom: 36 }}>What we stand for</Eyebrow>
        <div className="toova-grid-two landing-values" style={{ borderTop: '1px solid var(--rule-heavy)' }}>
          {VALUES.map(([title, body], i) => (
            <div
              key={title}
              className="landing-values__row"
              style={{
                borderBottom: i < 2 ? '1px solid var(--rule-hair)' : 'none',
              }}
            >
              <span className="landing-values__title">{title}</span>
              <span className="landing-values__body">{body}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="toova-frame landing-section-pad" ref={pricingRef}>
        <SectionOpener id="pricing" title="Two prices." note="Cancel any time · no card to start" />
        <div className="toova-grid-2-responsive" style={{ gap: 'var(--col-gap-wide)', paddingTop: 36 }}>
          <PriceColumn
            name="Free"
            price="$0"
            blurb="Everything you need to plan your first rooms."
            features={['Up to 5 rooms', 'Photo → 3D conversion', 'Full furniture catalog']}
            cta={loggedIn ? 'Go to dashboard' : 'Get started'}
            onCta={primaryAction}
          />
          <PriceColumn
            name="Studio"
            price="$18"
            blurb="For anyone styling several spaces at once."
            features={['Unlimited rooms', 'Priority 3D processing', 'Shareable room links', 'Early features']}
            cta={loggedIn ? 'Go to dashboard' : 'Start free trial'}
            ctaVariant="primary"
            onCta={primaryAction}
          />
        </div>
      </div>

      {/* Closing */}
      <div className="toova-frame" style={{ paddingTop: 128 }}>
        <div style={{ borderTop: '1px solid var(--rule-heavy)', paddingTop: 56 }}>
          <DisplayHeading level={2} as="h2">
            Own it
            <br />
            before you
            <br />
            <DisplayEm>buy</DisplayEm> it.
          </DisplayHeading>
          <div className="landing-closing-cta">
            <p style={{ font: 'var(--type-body-lg)', color: 'var(--ink-2)', margin: 0, maxWidth: 420 }}>
              Free to start. Bring your own photos; we&apos;ll handle the 3D.
            </p>
            <div className="landing-hero-actions">
              <Button variant="primary" size="lg" onClick={primaryAction}>
                {loggedIn ? 'Go to dashboard' : 'Start designing, free'}
              </Button>
              <Button variant="mono" onClick={secondaryAction}>
                {loggedIn ? 'Dashboard' : 'Log in'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Footer
        links={[
          { label: 'Contact', onClick: onContact },
          { label: 'Pitch Madness', onClick: onPitchMadness },
          { label: 'Feedback', onClick: () => setFeedbackOpen(true) },
          { label: 'Privacy' },
          { label: 'Terms' },
          ...(onAdmin ? [{ label: 'Admin', onClick: onAdmin }] : []),
        ]}
      />
    </div>
  );
}
