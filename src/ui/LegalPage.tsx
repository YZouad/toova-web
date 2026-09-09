import type { ReactNode } from 'react';
import {
  Button,
  DisplayHeading,
  Eyebrow,
  MarketingNav,
  MonoMeta,
  SiteFooter,
} from './kit';
import type { LegalDocument } from '../legal';

export interface LegalPageProps {
  document: LegalDocument;
  loggedIn?: boolean;
  onGoHome: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
  onGoDashboard?: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
  /** Optional slot below the document (e.g. standing report form on /safety). */
  children?: ReactNode;
}

export function LegalPage({
  document,
  loggedIn,
  onGoHome,
  onGetStarted,
  onLogin,
  onGoDashboard,
  onContact,
  onPitchMadness,
  onAdmin,
  children,
}: LegalPageProps) {
  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;

  return (
    <div className="toova-page">
      <div className="toova-paper" aria-hidden />

      <MarketingNav
        brandOnClick={onGoHome}
        links={[
          { label: 'Home', onClick: onGoHome },
          { label: 'Contact', onClick: onContact },
          { label: loggedIn ? 'Dashboard' : 'Log in', onClick: secondaryAction },
        ]}
        cta={
          <Button size="sm" onClick={primaryAction}>
            {loggedIn ? 'Go to dashboard' : 'Get started'}
          </Button>
        }
      />

      <div className="toova-frame legal-page" style={{ paddingTop: 104, paddingBottom: 80 }}>
        <Eyebrow level="page" style={{ marginBottom: 24 }}>
          Legal
        </Eyebrow>
        <DisplayHeading level={3}>{document.title}</DisplayHeading>
        <MonoMeta size="sm" tone="subtle" style={{ marginTop: 12 }}>
          Version {document.version} · Effective {document.effectiveDate}
        </MonoMeta>

        <div className="legal-page__sections">
          {document.sections.map((section) => (
            <section key={section.heading} className="legal-page__section">
              <h2 className="legal-page__heading">{section.heading}</h2>
              {section.body.map((para) => (
                <p key={para.slice(0, 48)} className="legal-page__p">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>

        {children}
      </div>

      <SiteFooter onContact={onContact} onPitchMadness={onPitchMadness} onAdmin={onAdmin} />
    </div>
  );
}
