import { useEffect, useState } from 'react';
import { initAnalytics } from '../lib/analytics';
import { getCookieConsent, setCookieConsent, type CookieConsentChoice } from '../lib/cookieConsent';
import { Button } from './kit';

export function CookieConsentBanner() {
  const [choice, setChoice] = useState<CookieConsentChoice | null>(() => getCookieConsent());

  useEffect(() => {
    if (choice === 'accepted') initAnalytics();
  }, [choice]);

  function decide(next: CookieConsentChoice) {
    setCookieConsent(next);
    setChoice(next);
  }

  if (choice) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <p className="cookie-consent__copy">
        We use cookies for essential site functions. Optional analytics cookies (Google Analytics)
        help us understand how Toova is used. You can reject analytics and still use the product.
        See our{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </a>
        .
      </p>
      <div className="cookie-consent__actions">
        <Button size="sm" variant="outline" onClick={() => decide('rejected')}>
          Reject
        </Button>
        <Button size="sm" onClick={() => decide('accepted')}>
          Accept
        </Button>
      </div>
    </div>
  );
}
