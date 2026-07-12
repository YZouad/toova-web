import { useRef, type RefObject } from 'react';
import { HeroTurntable } from './HeroTurntable';
import { MarketingNav } from './MarketingNav';

const HERO_STATS = [
  { n: '2.4s', l: 'avg. photo → 3D' },
  { n: '18', l: 'furniture categories' },
  { n: '∞', l: 'layouts per room' },
];

const MARQUEE_PIECES = [
  { label: 'Linen Three-Seater', cat: 'Seating', color: '#C2A07F' },
  { label: 'Travertine Coffee Table', cat: 'Tables', color: '#B8966F' },
  { label: 'Arc Floor Lamp', cat: 'Lighting', color: '#CBB591' },
  { label: 'Upholstered Platform Bed', cat: 'Bedroom', color: '#C9B391' },
  { label: 'Fiddle-Leaf Fig', cat: 'Decor', color: '#8E9A6E' },
  { label: 'Walnut Writing Desk', cat: 'Tables', color: '#B5946C' },
  { label: 'Bouclé Lounge Chair', cat: 'Seating', color: '#CBB28F' },
  { label: 'Open Oak Shelving', cat: 'Storage', color: '#A88457' },
  { label: 'Wool Flatweave Rug', cat: 'Decor', color: '#D8C7A8' },
  { label: 'Spindle Dining Chair', cat: 'Seating', color: '#BCA98A' },
  { label: 'Cane Sideboard', cat: 'Storage', color: '#B08C5F' },
  { label: 'Rattan Pendant', cat: 'Lighting', color: '#C9B488' },
];

const GALLERY = [
  { name: 'Sunlit Living Room', by: 'Maya Chen', pieces: '9 pieces', file: 'living-01.jpg', span: '' },
  { name: 'Reading Nook', by: 'Devin Park', pieces: '6 pieces', file: 'nook-02.jpg', span: 'grid-row: span 2' },
  { name: 'Home Office', by: 'Lena Ross', pieces: '6 pieces', file: 'office-03.jpg', span: '' },
  { name: 'Master Bedroom', by: 'Priya Nair', pieces: '7 pieces', file: 'bed-04.jpg', span: '' },
];

const HOW_STEPS = [
  { n: '01', title: 'Find a Product', body: 'Upload a product image or browse supported products.' },
  { n: '02', title: 'Create a 3D Model', body: 'Our AI converts the image into a 3D object ready for visualization.' },
  { n: '03', title: 'Design Your Space', body: 'Arrange furniture, decor, and accessories inside your room before purchasing.' },
  { n: '04', title: 'Shop Confidently', body: "Know what fits, what looks good, and what you'll actually love before checking out." },
];

const FUTURE_CAPABILITIES = [
  'Personalized product recommendations',
  'Smart bundle suggestions',
  'Live shopping carts',
  'AI-powered return assistance',
  'Subscription reminders',
  'Address management',
  'Price tracking',
  'Room-aware shopping recommendations',
];

const VALUES = [
  { title: 'Customer First', body: 'Shopping should feel exciting—not stressful. We obsess over making every experience intuitive, helpful, and enjoyable.' },
  { title: 'Sustainability', body: 'The best return is the one that never happens. Helping customers make better purchasing decisions reduces waste and unnecessary shipping.' },
  { title: 'Trust', body: "Your shopping data belongs to you. We're committed to transparent, secure, and privacy-conscious experiences." },
  { title: 'Innovation', body: "We're reimagining how people interact with products online through AI and spatial computing." },
];

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onPitchMadness: () => void;
  onWatchDemo: () => void;
  onAdmin?: () => void;
  loggedIn?: boolean;
  onGoDashboard?: () => void;
}

const PRICING_TIERS = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    blurb: 'Everything you need to design your first rooms.',
    features: ['Up to 5 rooms', 'Photo → 3D conversion', 'Full furniture catalog'],
    highlight: false,
  },
  {
    name: 'Studio',
    price: '$18',
    period: '/mo',
    blurb: 'For power users styling many spaces at once.',
    features: ['Unlimited rooms', 'Priority 3D processing', 'Shareable room links', 'Early features'],
    highlight: true,
  },
];

function MarqueePill({ label, cat, color }: { label: string; cat: string; color: string }) {
  return (
    <div className="landing-marquee-pill">
      <span style={{ width: 22, height: 22, borderRadius: 99, background: color, flex: 'none' }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: '#2B2620', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#A0937F', whiteSpace: 'nowrap' }}>{cat}</span>
    </div>
  );
}

export function LandingPage({ onGetStarted, onLogin, onPitchMadness, onWatchDemo, onAdmin, loggedIn, onGoDashboard }: LandingPageProps) {
  const doubled = [...MARQUEE_PIECES, ...MARQUEE_PIECES];

  const howRef = useRef<HTMLElement>(null);
  const galleryRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);

  const scrollTo = (ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;
  const primaryLabel = loggedIn ? 'Go to dashboard' : 'Get started';
  const secondaryLabel = loggedIn ? 'Dashboard' : 'Log in';

  return (
    <div className="landing-page">
      <MarketingNav
        page="landing"
        primaryLabel={primaryLabel}
        secondaryLabel={secondaryLabel}
        onPrimary={primaryAction}
        onSecondary={secondaryAction}
        onPitchMadness={onPitchMadness}
        onHowItWorks={() => scrollTo(howRef)}
        onGallery={() => scrollTo(galleryRef)}
        onPricing={() => scrollTo(pricingRef)}
      />

      <div className="landing-hero-wrap">
        <div className="landing-hero">
          <div className="landing-hero-grain" />
          <div className="landing-hero-glow-r" />
          <div className="landing-hero-glow-l" />
          <div className="landing-hero-grid">
            <div className="landing-hero-content">
              <div className="landing-hero-badge">
                <span className="landing-hero-dot" />
                Designed for students. Built for the future of shopping.
              </div>
              <h1 className="landing-hero-title">
                Own It Before<br />You Buy It.
              </h1>
              <p className="landing-hero-copy">
                Plan your space with confidence before you spend a dollar. Turn products into interactive 3D models, place them in your room, and design your space before making a purchase.
              </p>
              <div className="landing-hero-ctas">
                <button type="button" className="tv-btn-primary landing-hero-cta-primary" onClick={primaryAction}>{loggedIn ? 'Go to dashboard' : 'Start designing — free'}</button>
                <button type="button" className="tv-btn-ghost landing-hero-cta-secondary" onClick={loggedIn && onGoDashboard ? onGoDashboard : onWatchDemo}>{loggedIn ? 'My rooms' : 'Watch demo'}</button>
              </div>
            </div>
            <div className="landing-hero-3d">
              <div className="landing-hero-glow" />
              <HeroTurntable />
              <div className="landing-hero-live-badge">
                <span className="landing-hero-dot" />
                <span>live render · drag to spin</span>
              </div>
            </div>
          </div>
          <div className="landing-hero-stats">
            {HERO_STATS.map((s) => (
              <div key={s.l}>
                <div className="landing-stat-n">{s.n}</div>
                <div className="landing-stat-l">{s.l}</div>
              </div>
            ))}
            <div className="landing-hero-stats-spacer" />
            <span className="landing-hero-stats-meta">hero-room · live render</span>
          </div>
        </div>
      </div>

      <div className="landing-marquee">
        <div className="landing-marquee-track">
          {doubled.map((p, i) => (
            <MarqueePill key={`${p.label}-${i}`} {...p} />
          ))}
        </div>
      </div>

      <section className="landing-section landing-about-section">
        <div className="landing-about-grid">
          <div className="landing-about-main">
            <div className="landing-section-label">What is Toova?</div>
            <h2 className="landing-section-title landing-section-title--compact">
              Experience products before buying them.
            </h2>
            <p className="landing-body-copy">
              Every year, millions of people buy furniture, decor, and everyday essentials without knowing whether they&apos;ll actually fit their space or lifestyle.
            </p>
            <p className="landing-body-copy landing-about-lead">The result?</p>
            <div className="landing-pain-grid">
              {['Expensive returns', 'Buyer regret', 'Wasted time', 'Unnecessary landfill waste'].map((item) => (
                <div key={item} className="landing-pain-chip">{item}</div>
              ))}
            </div>
          </div>
          <aside className="landing-about-side">
            <p className="landing-body-copy">
              Using AI and augmented reality, shoppers can transform products into interactive 3D models, place them inside their own room, and make purchasing decisions with confidence.
            </p>
            <blockquote className="landing-mission-quote landing-mission-quote--card">
              Own it before you buy it.
            </blockquote>
          </aside>
        </div>
      </section>

      <section className="landing-section landing-how-section" ref={howRef}>
        <div className="landing-how-header">
          <div>
            <div className="landing-section-label">How It Works</div>
            <h2 className="landing-section-title landing-section-title--compact">From product photo<br />to a confident purchase.</h2>
          </div>
          <div className="landing-flow-pill">find&nbsp;&nbsp;→&nbsp;&nbsp;3D&nbsp;&nbsp;→&nbsp;&nbsp;design&nbsp;&nbsp;→&nbsp;&nbsp;buy</div>
        </div>
        <div className="landing-steps-grid landing-steps-grid--four">
          {HOW_STEPS.map((step) => (
            <div key={step.n} className="landing-step-card">
              <div className="landing-step-head">
                <span className="landing-step-num">{step.n}</span>
                <span className="landing-step-title">{step.title}</span>
              </div>
              <div className="landing-step-body">{step.body}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="landing-narrative-wrap">
        <section className="landing-section landing-split-section">
          <div className="landing-split-grid">
            <article className="landing-panel-card">
              <div className="landing-section-label">Why We&apos;re Building Toova</div>
              <h2 className="landing-panel-title">The best return is the one that never happens.</h2>
              <p className="landing-body-copy landing-about-lead">Every year:</p>
              <ul className="landing-problem-list">
                <li>Hundreds of billions of dollars worth of products are returned.</li>
                <li>Many returned items are never resold and ultimately become waste.</li>
              </ul>
              <p className="landing-body-copy landing-panel-foot">
                We&apos;re building shopping tools that reduce unnecessary purchases while helping customers buy with confidence.
              </p>
            </article>

            <article className="landing-panel-card landing-panel-card--accent">
              <div className="landing-section-label">Our First Step</div>
              <h2 className="landing-panel-title">Starting where we know the problem best.</h2>
              <p className="landing-body-copy">
                <strong>Student housing.</strong> Moving into a dorm or apartment often means making dozens of expensive purchases in just a few weeks.
              </p>
              <p className="landing-body-copy">
                We&apos;ve built an MVP that allows incoming students to visualize furniture and decor inside real UChicago dorm rooms before they buy.
              </p>
              <p className="landing-body-copy landing-panel-foot">
                This is only the beginning. Our long-term vision is to make confident shopping possible for every online purchase.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-section landing-future-section">
          <div className="landing-future-grid">
            <div className="landing-future-copy">
              <div className="landing-section-label">The Future of Shopping</div>
              <h2 className="landing-section-title landing-section-title--compact">One platform. Every purchase.</h2>
              <p className="landing-body-copy">
                We&apos;re building an AI shopping assistant that helps users throughout the entire purchasing journey.
              </p>
            </div>
            <div className="landing-capability-card">
              <div className="landing-capability-label">Coming to Toova</div>
              <ul className="landing-capability-grid">
                {FUTURE_CAPABILITIES.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-section landing-values-section">
          <div className="landing-values-header">
            <div className="landing-section-label">Our Values</div>
            <h2 className="landing-section-title landing-section-title--compact">What we stand for.</h2>
          </div>
          <div className="landing-values-grid">
            {VALUES.map((v) => (
              <div key={v.title} className="landing-value-card">
                <div className="landing-value-title">{v.title}</div>
                <div className="landing-value-body">{v.body}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section ref={galleryRef} className="landing-gallery-section">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 26 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 34, letterSpacing: '-.01em', margin: 0 }}>Rooms made with Toova</h2>
        </div>
        <div className="landing-gallery-grid">
          {GALLERY.map((g) => (
            <div
              key={g.name}
              style={{
                position: 'relative',
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'repeating-linear-gradient(45deg,#E9DFCC,#E9DFCC 10px,#E1D5BF 10px,#E1D5BF 20px)',
                cursor: 'pointer',
                gridRow: g.span || undefined,
              }}
            >
              <span style={{ position: 'absolute', left: 12, top: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7A6E5A', background: 'rgba(244,238,228,.85)', padding: '3px 8px', borderRadius: 6 }}>{g.file}</span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '18px 16px 15px', background: 'linear-gradient(to top,rgba(28,24,20,.84),rgba(28,24,20,.36) 55%,transparent)' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 500, color: '#F8F3EA', lineHeight: 1.12 }}>{g.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: 'rgba(248,243,234,.74)' }}>{g.by}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(248,243,234,.72)' }}>{g.pieces}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section ref={pricingRef} className="landing-pricing-section">
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="landing-section-label" style={{ textAlign: 'center' }}>Pricing</div>
          <h2 className="landing-section-title" style={{ margin: '0 auto', textAlign: 'center' }}>Simple, honest pricing.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20, alignItems: 'stretch' }}>
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 18,
                padding: '30px 26px',
                border: tier.highlight ? '1px solid var(--accent-line)' : '1px solid var(--border)',
                background: tier.highlight ? 'var(--accent-bg)' : 'var(--surface)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 500, marginBottom: 6 }}>{tier.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--text)' }}>{tier.price}</span>
                <span style={{ fontSize: 15, color: 'var(--text-subtle)' }}>{tier.period}</span>
              </div>
              <div style={{ fontSize: 14, color: '#6B6357', lineHeight: 1.5, marginBottom: 18 }}>{tier.blurb}</div>
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {tier.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: 'var(--text)' }}>
                    <span style={{ color: 'var(--accent)' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={tier.highlight ? 'tv-btn-primary' : 'tv-btn-ghost'}
                style={{ marginTop: 'auto', fontSize: 15, padding: '13px 20px' }}
                onClick={primaryAction}
              >
                {loggedIn ? 'Go to dashboard' : tier.highlight ? 'Start free trial' : 'Get started'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="landing-cta-band">
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 26, padding: '74px 56px', textAlign: 'center', background: 'linear-gradient(135deg,#3a322a 0%,#2B2620 55%,#1f1a15 100%)', boxShadow: '0 40px 84px -44px rgba(43,38,32,.6)' }}>
          <div className="landing-hero-grain" />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 'clamp(32px,5vw,54px)', letterSpacing: '-.02em', lineHeight: 1.02, margin: '0 0 16px', color: '#F8F3EA' }}>Own it before<br />you buy it.</h2>
            <p style={{ fontSize: 18, color: 'rgba(248,243,234,.72)', margin: '0 0 32px' }}>Plan your space with confidence. Free to start — bring your own photos and we&apos;ll handle the 3D.</p>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="tv-btn-primary" style={{ fontSize: 16, padding: '16px 30px' }} onClick={primaryAction}>{loggedIn ? 'Go to dashboard' : 'Start designing — free'}</button>
              <button type="button" className="tv-btn-ghost" style={{ fontSize: 16, padding: '16px 26px' }} onClick={secondaryAction}>{secondaryLabel}</button>
            </div>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: '#2B2620' }}>Toova</span>
          </div>
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
    </div>
  );
}
