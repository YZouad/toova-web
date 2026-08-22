import { useState } from 'react';
import { FeedbackModal } from './FeedbackModal';
import {
  Button,
  DisplayHeading,
  Eyebrow,
  Footer,
  MarketingNav,
  MonoMeta,
} from './kit';

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
  const [hoverEmail, setHoverEmail] = useState<string | null>(null);

  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;

  return (
    <div className="toova-page">
      <div className="toova-paper" aria-hidden />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} pageSource="contact" />

      <MarketingNav
        brandOnClick={onGoHome}
        links={[
          { label: 'Home', onClick: onGoHome },
          { label: 'Contact', active: true },
          { label: loggedIn ? 'Dashboard' : 'Log in', onClick: secondaryAction },
        ]}
        cta={
          <Button size="sm" onClick={primaryAction}>
            {loggedIn ? 'Go to dashboard' : 'Get started'}
          </Button>
        }
      />

      <div className="toova-frame" style={{ paddingTop: 104 }}>
        <Eyebrow level="page" style={{ marginBottom: 40 }}>
          Customer support
        </Eyebrow>
        <DisplayHeading level={3}>Contact us</DisplayHeading>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'var(--sidenote-col) 1fr',
            gap: 'var(--col-gap)',
            marginTop: 64,
            paddingTop: 44,
            borderTop: '1px solid var(--rule-heavy)',
            alignItems: 'start',
          }}
          className="toova-grid-label-prose"
        >
          <p style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: 0, gridColumn: '1 / -1' }}>
            Questions, bugs, or partnership ideas — reach the team directly or send feedback through the app.
          </p>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ borderTop: '1px solid var(--rule-heavy)' }}>
              {SUPPORT_EMAILS.map(({ address, label }, i) => {
                const hover = hoverEmail === address;
                return (
                  <a
                    key={address}
                    href={`mailto:${address}`}
                    onMouseEnter={() => setHoverEmail(address)}
                    onMouseLeave={() => setHoverEmail(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 24,
                      padding: '20px 4px',
                      borderBottom: i === SUPPORT_EMAILS.length - 1 ? 'none' : '1px solid var(--rule-hair)',
                      background: hover ? 'var(--bg-quiet)' : 'transparent',
                      transition: 'var(--transition-color)',
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <span
                      style={{
                        font: 'var(--type-h5)',
                        letterSpacing: 'var(--tracking-h-tight)',
                        color: hover ? 'var(--accent)' : 'var(--text-heading)',
                      }}
                    >
                      {label}
                    </span>
                    <MonoMeta size="lg" tone="default" style={{ color: hover ? 'var(--accent)' : undefined }}>
                      {address}
                    </MonoMeta>
                  </a>
                );
              })}
            </div>
            <div style={{ marginTop: 36 }}>
              <Button size="md" onClick={() => setFeedbackOpen(true)}>
                Report a bug or send feedback
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Footer
        links={[
          { label: 'Contact' },
          { label: 'Privacy' },
          { label: 'Terms' },
          ...(onAdmin ? [{ label: 'Admin', onClick: onAdmin }] : []),
        ]}
      />
    </div>
  );
}
