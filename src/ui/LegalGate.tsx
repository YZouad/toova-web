import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal';
import { AGE_INELIGIBLE_MESSAGE, dobIsoFromMonthYear, isDeviceAgeIneligible } from '../lib/ageGate';
import { BirthMonthYearFields } from './BirthMonthYearFields';
import {
  acceptLegalTerms,
  closeUnderageAccount,
  fetchLegalStatus,
  isUnderageError,
  type LegalStatus,
} from '../lib/legalAcceptance';
import { useAuth } from '../hooks/useAuth';
import { useRoute } from '../hooks/useRoute';
import { Banner, Button } from './kit';

/**
 * Blocking gate for signed-in users missing current Terms/Privacy acceptance.
 * Fails closed: if status can't be loaded, the app stays hidden behind a retry.
 * A birth date under 13 closes and erases the account.
 */
export function LegalGate({ children }: { children: ReactNode }) {
  const { user, logout, passwordRecovery } = useAuth();
  const route = useRoute();
  const skipGate = route.name === 'resetPassword' || passwordRecovery;
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ineligible, setIneligible] = useState(false);

  const closeAccount = useCallback(async () => {
    setBusy(true);
    setIneligible(true);
    try {
      await closeUnderageAccount();
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchLegalStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus(s);
        // A brand-new account on a browser that already failed the age screen is closed too.
        if (s.closed || (isDeviceAgeIneligible() && !s.terms_version)) void closeAccount();
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load account requirements');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, reloadKey, closeAccount]);

  if (!user || skipGate) return <>{children}</>;
  if (ineligible) {
    return (
      <div className="legal-gate">
        <div className="legal-gate__card" role="dialog" aria-modal="true">
          <p>{AGE_INELIGIBLE_MESSAGE}</p>
        </div>
      </div>
    );
  }
  if (status && status.accepted && !status.needs_acceptance && !status.closed) {
    return <>{children}</>;
  }

  if (!status) {
    return (
      <div className="legal-gate">
        <div className="legal-gate__card" role="dialog" aria-modal="true">
          {loadError && !loading ? (
            <>
              <Banner tone="error" style={{ marginBottom: 16 }}>
                We couldn’t check your account. Check your connection and try again.
              </Banner>
              <Button size="md" full onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
              <button type="button" className="legal-gate__signout" onClick={() => void logout()}>
                Sign out
              </button>
            </>
          ) : (
            <p>Checking account requirements…</p>
          )}
        </div>
      </div>
    );
  }

  async function handleAccept() {
    setError(null);
    if (!agreed) {
      setError('Check the box to agree to the Terms and Privacy Policy.');
      return;
    }
    const iso = dobIsoFromMonthYear(birthMonth, birthYear);
    if (!iso) {
      setError('Enter your birth month and year.');
      return;
    }
    setBusy(true);
    try {
      await acceptLegalTerms({ dob: iso, method: 'gate' });
      const next = await fetchLegalStatus();
      setStatus(next);
    } catch (e) {
      if (isUnderageError(e)) {
        await closeAccount();
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not save acceptance');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="legal-gate">
      <div className="legal-gate__card" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
        <h1 id="legal-gate-title" className="legal-gate__title">
          Review our Terms
        </h1>
        <p className="legal-gate__copy">
          To continue, enter your birth month and year and agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          {' '}(v{TERMS_VERSION}) and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          {' '}(v{PRIVACY_VERSION}).
        </p>
        {error ? <Banner tone="error" style={{ marginBottom: 16 }}>{error}</Banner> : null}
        <BirthMonthYearFields
          idPrefix="legal-birth"
          month={birthMonth}
          year={birthYear}
          onMonthChange={setBirthMonth}
          onYearChange={setBirthYear}
        />
        <label className="legal-gate__check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </span>
        </label>
        <Button size="md" full disabled={busy || !agreed || !birthMonth || !birthYear} onClick={() => void handleAccept()}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
        <button type="button" className="legal-gate__signout" onClick={() => void logout()} disabled={busy}>
          Sign out
        </button>
      </div>
    </div>
  );
}
