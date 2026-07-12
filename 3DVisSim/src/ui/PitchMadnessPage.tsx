import { useEffect, useRef, useState } from 'react';
import { JUST_WEB_DEMO_URL, MOBILE_DEMO_URL, TWO_D_THREE_D_DEMO_URL, DemoVideoModal } from './DemoVideoModal';
import { MarketingNav } from './MarketingNav';

interface PitchMadnessPageProps {
  onGoHome: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
  onAdmin?: () => void;
  loggedIn?: boolean;
  onGoDashboard?: () => void;
  scrollToDemosOnMount?: boolean;
  onDemosScrolled?: () => void;
}

const MVP_DONE = [
  'Design your dorm',
  'Place products inside your room',
  'Visualize furniture before buying',
];

const MVP_COMING = [
  'AI room recommendations',
  'Product bundles',
  'Cross-store shopping',
  'Personalized shopping assistant',
];

const BOOTH_PERKS = [
  { icon: '🎯', text: 'Experience our live demo' },
  { icon: '🦆', text: 'Grab a rubber duck' },
  { icon: '🍬', text: 'Free candy' },
  { icon: '💬', text: 'Meet the team and ask us anything' },
  { icon: '📱', text: 'Try Toova yourself' },
];

const DEMOS = [
  {
    id: '2d-3d',
    badge: '2D → 3D',
    badgeClass: '',
    url: TWO_D_THREE_D_DEMO_URL,
    caption: 'Upload a product photo and watch AI turn it into an interactive 3D model.',
    mobile: false,
  },
  {
    id: 'web',
    badge: 'Web',
    badgeClass: '',
    url: JUST_WEB_DEMO_URL,
    caption: 'Design your dorm, place furniture, and visualize your space on desktop.',
    mobile: false,
  },
  {
    id: 'mobile',
    badge: 'Mobile / AR',
    badgeClass: 'pitch-demo-badge--mobile',
    url: MOBILE_DEMO_URL,
    caption: 'View your room in augmented reality on iPhone.',
    mobile: true,
  },
] as const;

const SOLUTION_WINS = [
  'Better purchasing decisions',
  'Fewer returns',
  'Happier customers',
];

function DemoCard({
  demo,
  onFullScreen,
}: {
  demo: (typeof DEMOS)[number];
  onFullScreen: (url: string) => void;
}) {
  return (
    <div className={`pitch-demo-card${demo.mobile ? ' pitch-demo-card--mobile' : ''}`}>
      <div className="pitch-demo-card-head">
        <span className={`pitch-demo-badge${demo.badgeClass ? ` ${demo.badgeClass}` : ''}`}>{demo.badge}</span>
        <button type="button" className="pitch-demo-expand" onClick={() => onFullScreen(demo.url)}>Full screen</button>
      </div>
      <div className={`pitch-demo-media${demo.mobile ? ' pitch-demo-media--phone' : ''}`}>
        {demo.mobile ? (
          <div className="pitch-phone-screen">
            <video src={demo.url} controls playsInline preload="metadata" />
          </div>
        ) : (
          <video src={demo.url} controls playsInline preload="metadata" />
        )}
      </div>
      <p className="pitch-demo-caption">{demo.caption}</p>
    </div>
  );
}

export function PitchMadnessPage({
  onGoHome,
  onGetStarted,
  onLogin,
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
  const secondaryLabel = loggedIn ? 'Dashboard' : 'Log in';

  return (
    <div className="landing-page pitch-page">
      <MarketingNav
        page="pitch-madness"
        primaryLabel={primaryLabel}
        secondaryLabel={secondaryLabel}
        onPrimary={primaryAction}
        onSecondary={secondaryAction}
        onHome={onGoHome}
        onSeeDemo={scrollToDemos}
      />

      <header className="pitch-hero-band">
        <div className="pitch-hero-band-grain" />
        <div className="pitch-container pitch-hero-band-inner">
          <div className="landing-section-label pitch-hero-label">Pitch Madness 2026</div>
          <h1 className="pitch-hero-title">Welcome Pitch Madness Judges!</h1>
          <p className="pitch-hero-copy">
            Thanks for taking the time to learn more about Toova. Our presentation only scratched the surface.
            Here&apos;s a deeper look into the problem we&apos;re solving and where we&apos;re headed.
          </p>
          <div className="pitch-hero-actions">
            <button type="button" className="tv-btn-primary" onClick={scrollToDemos}>See demo</button>
            <button type="button" className="tv-btn-ghost pitch-hero-btn-ghost" onClick={primaryAction}>{primaryLabel}</button>
          </div>
        </div>
      </header>

      <div className="pitch-container">
        <div className="pitch-split-grid">
          <article className="pitch-card">
            <div className="landing-section-label">The Problem</div>
            <h2 className="pitch-card-title">Shopping online is convenient.<br />Buying confidently isn&apos;t.</h2>
            <p className="landing-body-copy">
              Consumers spend hundreds—even thousands—of dollars on products they&apos;ve never experienced in person.
              When something doesn&apos;t fit, doesn&apos;t match, or simply isn&apos;t what they expected, it gets returned.
            </p>
            <p className="landing-body-copy pitch-card-foot">
              That costs shoppers time, retailers money, and creates enormous environmental waste.
            </p>
          </article>

          <article className="pitch-card pitch-card--accent">
            <div className="landing-section-label">Our Solution</div>
            <h2 className="pitch-card-title">Experience products before purchasing.</h2>
            <p className="landing-body-copy">
              By combining AI, 3D generation, and augmented reality, shoppers can visualize products inside their own spaces before checking out.
            </p>
            <ul className="landing-problem-list pitch-card-list">
              {SOLUTION_WINS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </div>

      <section className="pitch-strip">
        <div className="pitch-container pitch-strip-inner">
          <div className="landing-section-label">Why Students?</div>
          <h2 className="pitch-strip-title">We know this problem firsthand.</h2>
          <p className="landing-body-copy pitch-strip-copy">
            Students move frequently. Dorm rooms are small. Budgets are tight. Buying furniture online is difficult.
            As students ourselves, we&apos;ve experienced these frustrations firsthand — student housing is the perfect place to build and validate our first product.
          </p>
        </div>
      </section>

      <div className="pitch-container">
        <section className="pitch-mvp-panel">
          <div className="pitch-mvp-header">
            <div>
              <div className="landing-section-label">Current MVP</div>
              <h2 className="pitch-card-title">What you can try today.</h2>
            </div>
            <button type="button" className="tv-btn-primary pitch-mvp-cta" onClick={primaryAction}>{primaryLabel}</button>
          </div>
          <div className="landing-mvp-grid">
            <div className="pitch-mvp-col">
              <div className="pitch-mvp-col-label">Today you can</div>
              <ul className="landing-mvp-checklist">
                {MVP_DONE.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="pitch-mvp-col pitch-mvp-col--soon">
              <div className="pitch-mvp-col-label">Coming soon</div>
              <ul className="landing-coming-list">
                {MVP_COMING.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <section id="pitch-demos" ref={demosRef} className="pitch-demos-section">
        <div className="pitch-container">
          <div className="pitch-demos-header">
            <div>
              <div className="landing-section-label">See It In Action</div>
              <h2 className="pitch-card-title">2D→3D, web &amp; mobile demos.</h2>
              <p className="landing-body-copy">Turn photos into 3D models, design your room on the web, then see it in AR on your phone.</p>
            </div>
          </div>
          <div className="pitch-demo-grid pitch-demo-grid--three">
            <div className="pitch-demo-stack">
              {landscapeDemos.map((demo) => (
                <DemoCard key={demo.id} demo={demo} onFullScreen={setModalVideo} />
              ))}
            </div>
            {mobileDemo ? (
              <DemoCard demo={mobileDemo} onFullScreen={setModalVideo} />
            ) : null}
          </div>
        </div>
      </section>

      <div className="pitch-container">
        <section className="pitch-vision-panel">
          <div className="pitch-vision-copy">
            <div className="landing-section-label">Our Vision</div>
            <h2 className="pitch-card-title">The next generation of commerce.</h2>
            <p className="landing-body-copy">
              Today&apos;s online shopping experience hasn&apos;t fundamentally changed in decades.
              We believe the next generation of commerce will be intelligent, interactive, and personalized.
            </p>
            <p className="landing-body-copy">
              We&apos;re building the AI shopping assistant that helps users make confident purchasing decisions before, during, and after every purchase.
            </p>
          </div>
          <blockquote className="pitch-vision-quote">
            Own it before you buy it.
          </blockquote>
        </section>
      </div>

      <section className="pitch-booth-band">
        <div className="pitch-booth-band-grain" />
        <div className="pitch-container pitch-booth-band-inner">
          <h2 className="pitch-booth-title">Stop By Our Booth!</h2>
          <div className="pitch-booth-grid">
            {BOOTH_PERKS.map((perk) => (
              <div key={perk.text} className="pitch-booth-item pitch-booth-item--dark">
                <span className="pitch-booth-icon" aria-hidden>{perk.icon}</span>
                <span>{perk.text}</span>
              </div>
            ))}
          </div>
          <div className="pitch-booth-actions">
            <button type="button" className="tv-btn-primary" onClick={scrollToDemos}>See demo</button>
            <button type="button" className="tv-btn-ghost pitch-booth-btn-ghost" onClick={primaryAction}>{primaryLabel}</button>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <button
            type="button"
            onClick={onGoHome}
            className="pitch-footer-brand"
          >
            <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: '#2B2620' }}>Toova</span>
          </button>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <span style={{ cursor: 'pointer' }}>Privacy</span>
            <span style={{ cursor: 'pointer' }}>Terms</span>
            {onAdmin ? (
              <button type="button" style={{ cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit' }} onClick={onAdmin}>Admin</button>
            ) : null}
            <span>© 2026 Toova</span>
          </div>
        </div>
      </footer>

      <DemoVideoModal open={!!modalVideo} src={modalVideo ?? undefined} onClose={() => setModalVideo(null)} />
    </div>
  );
}
