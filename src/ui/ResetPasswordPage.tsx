import { type FormEvent, useEffect, useState } from 'react';
import { trackLoggedIn } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
  Banner,
  Button,
  DisplayEm,
  DisplayHeading,
  Eyebrow,
  Field,
  Input,
  Logo,
  MonoMeta,
  SiteFooter,
  Splash,
  StatRow,
} from './kit';

interface ResetPasswordPageProps {
  onComplete: () => void;
  onRequestNewLink: () => void;
  onContact?: () => void;
  onPitchMadness?: () => void;
}

type AuthErrLike = { message?: string; code?: string };

function describePasswordError(err: unknown): string {
  const e = err as AuthErrLike;
  const rawMsg = e?.message ?? '';
  const msg = rawMsg.toLowerCase();
  const code = typeof e?.code === 'string' ? e.code : '';
  if (code === 'weak_password' || (msg.includes('password') && (msg.includes('weak') || msg.includes('least')))) {
    return 'Your password doesn\'t meet the requirements. Try a stronger password.';
  }
  if (msg.includes('same password') || msg.includes('should be different')) {
    return 'Choose a password that is different from your current one.';
  }
  return rawMsg || 'Could not update your password. Try again or request a new link.';
}

function hasRecoveryCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  const search = new URLSearchParams(window.location.search);
  return (
    hash.includes('type=recovery') ||
    hash.includes('access_token') ||
    search.has('code') ||
    search.has('token_hash')
  );
}

function validateNewPassword(password: string, confirm: string): string | null {
  if (!password && !confirm) return 'Enter a new password and confirm it.';
  if (!password) return 'Enter a new password.';
  if (!confirm) return 'Confirm your new password.';
  if (password.length < 6) return 'Your password must be at least 6 characters.';
  if (password !== confirm) return 'Those passwords don\'t match.';
  return null;
}

export function ResetPasswordPage({
  onComplete,
  onRequestNewLink,
  onContact,
  onPitchMadness,
}: ResetPasswordPageProps) {
  const { loading: sessionLoading, user, endPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [urlPending, setUrlPending] = useState(hasRecoveryCallback);

  useEffect(() => {
    if (user) setUrlPending(false);
  }, [user]);

  useEffect(() => {
    if (user || !urlPending) return;
    const timer = window.setTimeout(() => setUrlPending(false), 2500);
    return () => window.clearTimeout(timer);
  }, [user, urlPending]);

  const waitingForSession = sessionLoading || urlPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const clientErr = validateNewPassword(password, confirm);
    if (clientErr) {
      setError(clientErr);
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      endPasswordRecovery();
      trackLoggedIn({ user_id: user?.id ?? '', method: 'email' });
      setInfo('Your password was updated.');
      onComplete();
    } catch (err: unknown) {
      setError(describePasswordError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrap toova-page">
      <div className="auth-page">
        <div className="toova-paper" aria-hidden />

        <div className="auth-poster">
          <Logo size={21} onClick={user ? undefined : onRequestNewLink} />
          <div className="auth-poster__copy">
            <Eyebrow level="page" className="auth-poster__tagline" style={{ marginBottom: 32 }}>
              Toova — a room planner
            </Eyebrow>
            <DisplayHeading level={3} className="auth-poster__headline">
              Own it
              <br />
              before you
              <br />
              <DisplayEm>buy</DisplayEm> it.
            </DisplayHeading>
            <div className="auth-poster__stats">
              <StatRow items={['Photo → 3D in 32.4s', '18 categories', 'Free for five rooms']} />
            </div>
          </div>
        </div>

        <div className="auth-form-side">
          <div className="auth-form-wrap">
            {waitingForSession ? (
              <Splash label="Checking reset link…" />
            ) : !user ? (
              <>
                <Eyebrow level="page" style={{ marginBottom: 12 }}>
                  Account
                </Eyebrow>
                <DisplayHeading level={5} as="h2" style={{ marginBottom: 12 }}>
                  This reset link is invalid or expired
                </DisplayHeading>
                <Banner tone="error" style={{ marginBottom: 18 }}>
                  Request a new link from the sign-in page. Links can only be used once.
                </Banner>
                <Button size="md" full type="button" onClick={onRequestNewLink}>
                  Request a new link
                </Button>
              </>
            ) : (
              <>
                <Eyebrow level="page" style={{ marginBottom: 12 }}>
                  Account
                </Eyebrow>
                <DisplayHeading level={5} as="h2" style={{ marginBottom: 10 }}>
                  Choose a new password
                </DisplayHeading>
                <MonoMeta size="sm" tone="subtle" style={{ display: 'block', marginBottom: 24 }}>
                  Use at least 6 characters. You&apos;ll stay signed in after this.
                </MonoMeta>
                {info ? <Banner tone="info" style={{ marginBottom: 18 }}>{info}</Banner> : null}
                {error ? <Banner tone="error" style={{ marginBottom: 18 }}>{error}</Banner> : null}
                <form onSubmit={(e) => void handleSubmit(e)} noValidate>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <Field label="New password" hint="At least 6 characters.">
                      <Input
                        id="reset-pass"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </Field>
                    <Field label="Confirm password">
                      <Input
                        id="reset-pass-confirm"
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••••"
                      />
                    </Field>
                    <Button size="md" full type="submit" disabled={loading}>
                      {loading ? 'Please wait…' : 'Update password'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <SiteFooter onContact={onContact} onPitchMadness={onPitchMadness} />
    </div>
  );
}
