export const COOKIE_CONSENT_KEY = 'toova-cookie-consent';

/** Window event that reopens the consent banner (footer / profile "Cookie settings"). */
export const OPEN_COOKIE_SETTINGS_EVENT = 'toova:open-cookie-settings';

export type CookieConsentChoice = 'accepted' | 'rejected';

/** Browsers send Global Privacy Control as an opt-out of sale/sharing; treat it as a rejection. */
export function hasGlobalPrivacyControl(): boolean {
  try {
    return typeof navigator !== 'undefined'
      && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

export function getCookieConsent(): CookieConsentChoice | null {
  if (hasGlobalPrivacyControl()) return 'rejected';
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

export function openCookieSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

/** Remove Google Analytics cookies (`_ga`, `_ga_<id>`) for this host and its parent domain. */
export function clearAnalyticsCookies(): void {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  const parts = host.split('.');
  const domains = ['', host, parts.length > 1 ? `.${parts.slice(-2).join('.')}` : host];
  for (const raw of document.cookie.split(';')) {
    const name = raw.split('=')[0]?.trim();
    if (!name || !(name === '_ga' || name.startsWith('_ga_') || name === '_gid')) continue;
    for (const domain of domains) {
      const domainAttr = domain ? `; domain=${domain}` : '';
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainAttr}`;
    }
  }
}
