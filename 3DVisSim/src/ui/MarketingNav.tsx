import { useState } from 'react';

type NavPage = 'landing' | 'pitch-madness';

interface MarketingNavProps {
  page: NavPage;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onHome?: () => void;
  onPitchMadness?: () => void;
  onSeeDemo?: () => void;
  onHowItWorks?: () => void;
  onGallery?: () => void;
  onPricing?: () => void;
}

export function MarketingNav({
  page,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onHome,
  onPitchMadness,
  onSeeDemo,
  onHowItWorks,
  onGallery,
  onPricing,
}: MarketingNavProps) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  const run = (fn?: () => void) => {
    fn?.();
    close();
  };

  const brand = (
    <>
      <div className="tv-logo-mark">t</div>
      <span className="tv-logo-text">Toova</span>
    </>
  );

  return (
    <nav className="landing-nav">
      <div className="landing-nav-inner">
        {page === 'pitch-madness' ? (
          <button type="button" className="landing-nav-brand" onClick={() => run(onHome)}>
            {brand}
          </button>
        ) : (
          <div className="landing-nav-brand">{brand}</div>
        )}

        <button
          type="button"
          className="landing-nav-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? '×' : '☰'}
        </button>

        <div className={`landing-nav-links${open ? ' landing-nav-links--open' : ''}`}>
          {page === 'landing' ? (
            <>
              <button type="button" className="landing-nav-link" onClick={() => run(onHowItWorks)}>How it works</button>
              <button type="button" className="landing-nav-link" onClick={() => run(onGallery)}>Gallery</button>
              <button type="button" className="landing-nav-link" onClick={() => run(onPricing)}>Pricing</button>
              <button type="button" className="landing-nav-link" onClick={() => run(onPitchMadness)}>Pitch Madness</button>
            </>
          ) : (
            <>
              <button type="button" className="landing-nav-link" onClick={() => run(onHome)}>Home</button>
              <button type="button" className="landing-nav-link" onClick={() => run(onSeeDemo)}>See demo</button>
              <span className="landing-nav-link landing-nav-link--active">Pitch Madness</span>
            </>
          )}
          <button type="button" className="landing-nav-link landing-nav-link--emphasis" onClick={() => run(onSecondary)}>{secondaryLabel}</button>
          <button type="button" className="tv-btn-primary landing-nav-cta" onClick={() => run(onPrimary)}>{primaryLabel}</button>
        </div>
      </div>
    </nav>
  );
}
