import { type FormEvent, useState } from 'react';
import { trackLoggedIn, trackSignedUp } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { loadGuestDesignSnapshot } from '../lib/guestDesignSnapshot';
import { isAtLeast13, parseDobInput } from '../lib/ageGate';
import {
  acceptLegalTerms,
  stashPendingLegalAcceptance,
} from '../lib/legalAcceptance';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal';
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
  StatRow,
  Tabs,
} from './kit';

type Mode = 'signin' | 'signup';

interface AuthPageProps {
  onBack: () => void;
  initialMode?: Mode;
  onContact?: () => void;
  onPitchMadness?: () => void;
  /** Optional copy when auth is required to persist a guest design. */
  authReason?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFields(emailTrimmed: string, password: string, mode: Mode): string | null {
  if (!emailTrimmed && !password) return 'Enter your email address and your password.';
  if (!emailTrimmed) return 'Enter your email address.';
  if (!password) return 'Enter your password.';
  if (!EMAIL_RE.test(emailTrimmed)) return 'That email address isn\'t valid. Fix your email and try again.';
  if (mode === 'signup' && password.length < 6) return 'Your password must be at least 6 characters.';
  return null;
}

type AuthErrLike = { message?: string; code?: string };

function describeAuthFailure(err: unknown, mode: Mode): string {
  const e = err as AuthErrLike;
  const rawMsg = e?.message ?? '';
  const msg = rawMsg.toLowerCase();
  const code = typeof e?.code === 'string' ? e.code : '';

  if (code === 'weak_password' || (msg.includes('password') && (msg.includes('weak') || msg.includes('least')))) {
    return 'Your password doesn\'t meet the requirements. Try a stronger password.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Confirm your email address before signing in.';
  }
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) {
    return 'That email is already registered. Try signing in instead.';
  }
  if (code === 'user_not_found') return 'No account exists with this email address.';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return mode === 'signin'
      ? 'Wrong password for this email, or no account uses this email.'
      : rawMsg || 'Something went wrong. Please try again.';
  }
  if (msg.includes('at least 13')) {
    return 'You must be at least 13 years old to use Toova.';
  }
  return rawMsg || 'Something went wrong. Please try again.';
}

function oauthRedirectTo(): string {
  return `${window.location.origin}/`;
}

export function AuthPage({
  onBack,
  initialMode = 'signin',
  onContact,
  onPitchMadness,
  authReason = null,
}: AuthPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'facebook' | null>(null);

  function validateSignupLegal(): string | null {
    if (!agreed) {
      return 'Check the box to agree to the Terms and Privacy Policy.';
    }
    const parsed = parseDobInput(dob);
    if (!parsed) return 'Enter a valid date of birth.';
    if (!isAtLeast13(parsed)) {
      return 'You must be at least 13 years old to use Toova.';
    }
    return null;
  }

  async function handleOAuth(provider: 'google' | 'facebook') {
    setError(null);
    setInfo(null);
    if (mode === 'signup') {
      const legalErr = validateSignupLegal();
      if (legalErr) {
        setError(legalErr);
        return;
      }
      stashPendingLegalAcceptance(dob, 'signup_oauth');
    }
    setOauthBusy(provider);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: oauthRedirectTo(),
        },
      });
      if (err) throw err;
    } catch (err: unknown) {
      setError(describeAuthFailure(err, mode));
      setOauthBusy(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const emailTrimmed = email.trim();
    const clientErr = validateFields(emailTrimmed, password, mode);
    if (clientErr) { setError(clientErr); return; }

    if (mode === 'signup') {
      const legalErr = validateSignupLegal();
      if (legalErr) { setError(legalErr); return; }
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: emailTrimmed, password });
        if (err) throw err;
        trackLoggedIn({ user_id: data.user?.id ?? '', method: 'email' });
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: name.trim() ? { data: { full_name: name.trim() } } : undefined,
        });
        if (err) throw err;
        trackSignedUp({
          user_id: data.user?.id ?? '',
          method: 'email',
          converted_from_guest: loadGuestDesignSnapshot() != null,
        });
        // Session may be null when email confirmation is required — stash for gate / next sign-in.
        if (data.session && data.user) {
          try {
            await acceptLegalTerms({ dob, method: 'signup_email' });
          } catch (acceptErr) {
            stashPendingLegalAcceptance(dob, 'signup_email');
            throw acceptErr;
          }
        } else {
          stashPendingLegalAcceptance(dob, 'signup_email');
        }
        setInfo('Check your email for a confirmation link, then sign in.');
        setMode('signin');
      }
    } catch (err: unknown) {
      setError(describeAuthFailure(err, mode));
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || oauthBusy !== null;
  const signupBlocked = mode === 'signup' && (!agreed || !dob);

  return (
    <div className="auth-page-wrap toova-page">
      <div className="auth-page">
        <div className="toova-paper" aria-hidden />

        <div className="auth-poster">
          <Logo size={21} onClick={onBack} />
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
          <Tabs
            active={mode}
            onChange={(id) => {
              setMode(id as Mode);
              setError(null);
              setInfo(null);
            }}
            style={{ marginBottom: 24 }}
            tabs={[
              { id: 'signin', label: 'Sign in' },
              { id: 'signup', label: 'Create account' },
            ]}
          />

          {authReason ? (
            <Banner tone="info" style={{ marginBottom: 18 }}>
              {authReason}
            </Banner>
          ) : null}
          {info ? <Banner tone="info" style={{ marginBottom: 18 }}>{info}</Banner> : null}
          {error ? <Banner tone="error" style={{ marginBottom: 18 }}>{error}</Banner> : null}

          <div className="auth-oauth-stack">
            <Button
              size="md"
              full
              variant="outline"
              type="button"
              disabled={busy || signupBlocked}
              onClick={() => void handleOAuth('google')}
            >
              {oauthBusy === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </Button>
            <Button
              size="md"
              full
              variant="outline"
              type="button"
              disabled={busy || signupBlocked}
              onClick={() => void handleOAuth('facebook')}
            >
              {oauthBusy === 'facebook' ? 'Redirecting…' : 'Continue with Facebook'}
            </Button>
          </div>

          <div className="auth-oauth-divider" role="separator">
            <span>or use email</span>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {mode === 'signup' ? (
                <Field label="Name">
                  <Input
                    id="auth-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maya Chen"
                  />
                </Field>
              ) : null}
              <Field label="Email">
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </Field>
              <Field
                label="Password"
                hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
              >
                <Input
                  id="auth-pass"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              {mode === 'signup' ? (
                <>
                  <Field label="Date of birth" hint="You must be at least 13." htmlFor="auth-dob">
                    <Input
                      id="auth-dob"
                      type="date"
                      autoComplete="bday"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </Field>
                  <label className="auth-legal-check">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      I agree to the{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer">
                        Terms of Service
                      </a>
                      {' '}(v{TERMS_VERSION}) and{' '}
                      <a href="/privacy" target="_blank" rel="noopener noreferrer">
                        Privacy Policy
                      </a>
                      {' '}(v{PRIVACY_VERSION}).
                    </span>
                  </label>
                </>
              ) : null}
              <Button size="md" full type="submit" disabled={busy || signupBlocked}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in with email' : 'Create account'}
              </Button>
              <div className="auth-form-footer">
                <Button variant="mono" type="button">
                  Forgot password →
                </Button>
                <MonoMeta size="sm" tone="subtle" upper className="auth-form-footer__card-note">
                  No card until you buy
                </MonoMeta>
              </div>
            </div>
          </form>

          <div className="auth-back-row">
            <button type="button" onClick={onBack}>
              ← Back to home
            </button>
          </div>
        </div>
      </div>
      </div>

      <SiteFooter onContact={onContact} onPitchMadness={onPitchMadness} />
    </div>
  );
}
