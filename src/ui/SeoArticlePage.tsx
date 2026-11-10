import { useEffect, type MouseEvent } from 'react';
import { UCHICAGO_DORM_ARTICLES } from '../content/dorms';
import { UChicagoDormDesignShowcase } from './uchicago/UChicagoDormDesignShowcase';
import type { SeoArticle } from '../content/types';
import { navigate } from '../hooks/useRoute';
import { Button } from './kit/Button';
import { DisplayHeading } from './kit/DisplayHeading';
import { Eyebrow } from './kit/Eyebrow';
import { Footer } from './kit/Footer';
import { MarketingNav, MarketingNavAuthActions } from './kit/MarketingNav';
import { SectionOpener } from './kit/SectionOpener';
import { openCookieSettings } from '../lib/cookieConsent';

export interface SeoArticlePageProps {
  article: SeoArticle;
  loggedIn?: boolean;
  onGoHome: () => void;
  onGetStarted: () => void;
  onLogin: () => void;
  onGoDashboard?: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
  onAdmin?: () => void;
}

function spaClick(href: string, onNavigate?: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (onNavigate) onNavigate();
    else navigate(href);
  };
}

export function SeoArticlePage({
  article,
  loggedIn,
  onGoHome,
  onGetStarted,
  onLogin,
  onGoDashboard,
  onContact,
  onPitchMadness,
  onAdmin,
}: SeoArticlePageProps) {
  const primaryAction = loggedIn && onGoDashboard ? onGoDashboard : onGetStarted;
  const secondaryAction = loggedIn && onGoDashboard ? onGoDashboard : onLogin;
  const isUchicagoHub = article.path === '/dorms/uchicago/';
  const isUchicagoDesign = article.path === '/dorms/uchicago/design-your-dorm/';

  useEffect(() => {
    document.documentElement.dataset.seoReady = '1';
    return () => {
      delete document.documentElement.dataset.seoReady;
    };
  }, [article.path]);

  const handleCta = () => {
    if (!article.cta) {
      primaryAction();
      return;
    }
    const href = article.cta.href;
    if (href.startsWith('/?') || href === '/') {
      navigate(href);
      primaryAction();
      return;
    }
    navigate(href);
  };

  return (
    <div className="toova-page seo-article-page" data-seo-ready="1">
      <div className="toova-paper" aria-hidden />

      <MarketingNav
        brandOnClick={onGoHome}
        links={[
          { label: 'Home', href: '/', onClick: onGoHome },
          {
            label: 'Room designer',
            href: '/room-designer/',
            onClick: () => navigate('/room-designer/'),
            active: article.path === '/room-designer/',
          },
          {
            label: 'Dorms',
            href: '/dorms/uchicago/',
            onClick: () => navigate('/dorms/uchicago/'),
            active: article.path.startsWith('/dorms/'),
          },
          {
            label: 'Pricing',
            href: '/pricing/',
            onClick: () => navigate('/pricing/'),
          },
          ...(onContact
            ? [{ label: 'Contact', onClick: onContact }]
            : []),
        ]}
        cta={
          <MarketingNavAuthActions
            loggedIn={loggedIn}
            onLogin={secondaryAction}
            onPrimary={primaryAction}
          />
        }
      />

      <main className="toova-frame" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <nav aria-label="Breadcrumb" className="seo-article-page__crumbs">
          {article.breadcrumbs.map((crumb, i) => {
            const last = i === article.breadcrumbs.length - 1;
            return (
              <span key={crumb.path + crumb.name}>
                {i > 0 ? <span aria-hidden> / </span> : null}
                {last ? (
                  <span>{crumb.name}</span>
                ) : (
                  <a href={crumb.path} onClick={spaClick(crumb.path, crumb.path === '/' ? onGoHome : undefined)}>
                    {crumb.name}
                  </a>
                )}
              </span>
            );
          })}
        </nav>

        <Eyebrow style={{ marginTop: 28, marginBottom: 16 }}>Toova</Eyebrow>
        <DisplayHeading level={2} as="h1" style={{ maxWidth: 900 }}>
          {article.heading}
        </DisplayHeading>
        <p
          style={{
            font: 'var(--type-lead)',
            color: 'var(--ink-2)',
            margin: '20px 0 0',
            maxWidth: 'var(--measure-lead)',
          }}
        >
          {article.lead}
        </p>

        {article.cta ? (
          <div className="landing-hero-actions" style={{ marginTop: 28 }}>
            <Button variant="primary" size="lg" onClick={handleCta}>
              {article.cta.label}
            </Button>
            <Button variant="mono" onClick={secondaryAction}>
              {loggedIn ? 'Dashboard' : 'Log in'}
            </Button>
          </div>
        ) : null}

        {isUchicagoDesign ? (
          <div style={{ marginTop: 48 }}>
            <UChicagoDormDesignShowcase />
          </div>
        ) : null}

        {isUchicagoHub ? (
          <div style={{ marginTop: 48 }}>
            <UChicagoDormDesignShowcase
              compact
              onOpenFullGuide={() => navigate('/dorms/uchicago/design-your-dorm/')}
            />
          </div>
        ) : null}

        {article.sections.map((section) => (
          <section key={section.heading} style={{ marginTop: 56 }}>
            <SectionOpener title={section.heading} />
            <div style={{ display: 'grid', gap: 16, paddingTop: 20, maxWidth: 720 }}>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 48)}
                  style={{ font: 'var(--type-body)', color: 'var(--ink-2)', margin: 0 }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        {isUchicagoHub ? (
          <section style={{ marginTop: 56 }}>
            <SectionOpener title="All measured layouts" note="Open in Toova" />
            <ul className="seo-article-page__list">
              {UCHICAGO_DORM_ARTICLES.map((dorm) => (
                <li key={dorm.path}>
                  <a href={dorm.path} onClick={spaClick(dorm.path)}>
                    {dorm.heading}
                  </a>
                  <span className="seo-article-page__list-meta">{dorm.lead}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {article.faq?.length ? (
          <section style={{ marginTop: 56 }} id="faq">
            <SectionOpener title="Questions." />
            <div className="landing-faq" style={{ paddingTop: 24 }}>
              {article.faq.map((item) => (
                <div key={item.question} className="landing-faq__item">
                  <h2 className="landing-faq__question">{item.question}</h2>
                  <p className="landing-faq__answer">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Footer
        links={[
          { label: 'Home', href: '/', onClick: onGoHome },
          {
            label: 'Room designer',
            href: '/room-designer/',
            onClick: () => navigate('/room-designer/'),
          },
          {
            label: 'Dorm plans',
            href: '/dorms/uchicago/',
            onClick: () => navigate('/dorms/uchicago/'),
          },
          {
            label: 'Pricing',
            href: '/pricing/',
            onClick: () => navigate('/pricing/'),
          },
          ...(onContact ? [{ label: 'Contact', onClick: onContact }] : []),
          ...(onPitchMadness ? [{ label: 'Pitch Madness', onClick: onPitchMadness }] : []),
          { label: 'Privacy', href: '/privacy/' },
          { label: 'Terms', href: '/terms/' },
          { label: 'Child Safety', href: '/safety/' },
          { label: 'Cookie settings', onClick: openCookieSettings },
          ...(onAdmin ? [{ label: 'Admin', onClick: onAdmin }] : []),
        ]}
      />
    </div>
  );
}
