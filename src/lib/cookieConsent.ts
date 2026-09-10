export const COOKIE_CONSENT_KEY = 'toova-cookie-consent';

export type CookieConsentChoice = 'accepted' | 'rejected';

export function getCookieConsent(): CookieConsentChoice | null {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (raw === 'accepted' || raw === 'rejected') return raw;
    return null;
  } catch {
    return null;
  }
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, choice);
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasAcceptedAnalytics(): boolean {
  return getCookieConsent() === 'accepted';
}
