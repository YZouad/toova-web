import { useState } from 'react';
import { FeedbackModal } from './FeedbackModal';
import { MarketingNav } from './MarketingNav';

const SUPPORT_EMAILS = [
  { address: 'ag@toova.net', label: 'General support' },
  { address: 'yz@toova.net', label: 'Product & design' },
  { address: 'ft@toova.net', label: 'Technical issues' },
] as const;

interface ContactPageProps {
  loggedIn?: boolean;
  onGoHome: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
  onGoDashboard?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
}

export function ContactPage({
  loggedIn,
  onGoHome,
  onGetStarted,
  onLogin,
  onGoDashboard,
  onPitchMadness,
  onAdmin,
}: ContactPageProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;
  const primaryLabel = loggedIn ? 'Go to dashboard' : 'Get started';
  const secondaryLabel = loggedIn ? 'Dashboard' : 'Log in';

  return (
    <div className="landing-page contact-page">
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="contact"
      />

      <MarketingNav
        page="contact"
        primaryLabel={primaryLabel}
        secondaryLabel={secondaryLabel}
        onPrimary={primaryAction}
        onSecondary={secondaryAction}
        onHome={onGoHome}
        onPitchMadness={onPitchMadness}
      />

      <main className="contact-main">
        <div className="contact-inner">
          <p className="landing-section-label">Customer support</p>
          <h1 className="contact-title">Contact us</h1>
          <p className="contact-lead">
            Questions, bugs, or partnership ideas — reach the team directly or send feedback through the app.
          </p>

          <div className="contact-email-list">
            {SUPPORT_EMAILS.map(({ address, label }) => (
              <a key={address} className="contact-email-card" href={`mailto:${address}`}>
                <span className="contact-email-label">{label}</span>
                <span className="contact-email-address">{address}</span>
              </a>
            ))}
          </div>

          <button
            type="button"
            className="tv-btn-primary contact-feedback-btn"
            onClick={() => setFeedbackOpen(true)}
          >
            Report a bug or send feedback
          </button>
        </div>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <button type="button" className="contact-footer-brand" onClick={onGoHome}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--accent)' }} />
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: '#2B2620' }}>Toova</span>
          </button>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <span className="landing-footer-link landing-footer-link--active">Contact</span>
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
