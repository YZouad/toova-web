import { useEffect, useState, type ReactNode } from 'react';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal';
import { isAtLeast13, parseDobInput } from '../lib/ageGate';
import {
  acceptLegalTerms,
  fetchLegalStatus,
  type LegalStatus,
} from '../lib/legalAcceptance';
import { useAuth } from '../hooks/useAuth';
import { Banner, Button, Field, Input } from './kit';

/**
 * Blocking gate for signed-in users missing current Terms/Privacy acceptance.
 * Under-13 submissions sign the user out.
 */
export function LegalGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [dob, setDob] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchLegalStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load legal status');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) return <>{children}</>;
  if (loading && !status) {
    return (
      <div className="legal-gate">
        <div className="legal-gate__card">
          <p>Checking account requirements…</p>
        </div>
      </div>
    );
  }
  if (status && !status.needs_acceptance && status.accepted) {
    return <>{children}</>;
  }
  if (!status?.needs_acceptance && status?.accepted !== false) {
    // Unknown / error — don't block forever on transient failures once we have a row.
    if (!status && error) {
      return <>{children}</>;
    }
  }

  async function handleAccept() {
    setError(null);
    if (!agreed) {
      setError('Check the box to agree to the Terms and Privacy Policy.');
      return;
    }
    const parsed = parseDobInput(dob);
    if (!parsed) {
      setError('Enter a valid date of birth.');
      return;
    }
    if (!isAtLeast13(parsed)) {
      setError('You must be at least 13 years old to use Toova.');
      setBusy(true);
      try {
        await logout();
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await acceptLegalTerms({ dob, method: 'gate' });
      const next = await fetchLegalStatus();
      setStatus(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save acceptance';
      if (/at least 13/i.test(msg)) {
        setError('You must be at least 13 years old to use Toova.');
        await logout();
      } else {
        setError(msg);
      }
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
          To continue, confirm you are at least 13 and agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
          {' '}(v{TERMS_VERSION}) and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          {' '}(v{PRIVACY_VERSION}).
        </p>
        {error ? <Banner tone="error" style={{ marginBottom: 16 }}>{error}</Banner> : null}
        <Field label="Date of birth">
          <Input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            required
          />
        </Field>
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
        <Button size="md" full disabled={busy || !agreed || !dob} onClick={() => void handleAccept()}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
        <button type="button" className="legal-gate__signout" onClick={() => void logout()} disabled={busy}>
          Sign out
        </button>
      </div>
    </div>
  );
}
