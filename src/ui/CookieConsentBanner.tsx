import { useEffect, useState } from 'react';
import { disableAnalytics, initAnalytics, trackPageView } from '../lib/analytics';
import {
  OPEN_COOKIE_SETTINGS_EVENT,
  getCookieConsent,
  hasGlobalPrivacyControl,
  setCookieConsent,
  type CookieConsentChoice,
} from '../lib/cookieConsent';
import { Button } from './kit';

export function CookieConsentBanner() {
  const [choice, setChoice] = useState<CookieConsentChoice | null>(() => getCookieConsent());
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    if (choice === 'accepted') initAnalytics();
  }, [choice]);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
  }, []);

  function decide(next: CookieConsentChoice) {
    const previous = choice;
    setCookieConsent(next);
    setChoice(next);
    setReopened(false);
    if (next === 'accepted') {
      initAnalytics();
      trackPageView();
    } else if (previous === 'accepted') {
      disableAnalytics();
    }
  }

  if (choice && !reopened) return null;

  const gpc = hasGlobalPrivacyControl();

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <p className="cookie-consent__copy">
        We use essential cookies to run Toova (sign-in, security, and saving your rooms).
        Operational product records — accounts, rooms, generations, likes, and shopping-list
        items — are stored to provide the service. Optional analytics (Google Analytics and
        Toova’s first-party event store) only run after you accept, and never include your
        email or name. You can reject analytics and still use the product, and change your
        choice any time from “Cookie settings”. See our{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        .
        {gpc ? ' Your browser’s Global Privacy Control signal is on, so analytics stay off.' : null}
        {reopened && choice ? ` Current choice: analytics ${choice}.` : null}
      </p>
      <div className="cookie-consent__actions">
        <Button size="sm" variant="outline" onClick={() => decide('rejected')}>
          Reject
        </Button>
        {gpc ? null : (
          <Button size="sm" onClick={() => decide('accepted')}>
            Accept
          </Button>
        )}
      </div>
    </div>
  );
}
