import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { IntroBackButton } from './IntroBackButton';

type Mode = 'signin' | 'signup';

interface LoginPageProps {
  onBack?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFields(emailTrimmed: string, password: string, mode: Mode): string | null {
  const emptyEmail = emailTrimmed === '';
  const emptyPassword = password === '';

  if (emptyEmail && emptyPassword) {
    return 'Enter your email address and your password.';
  }
  if (emptyEmail) {
    return 'Enter your email address.';
  }
  if (emptyPassword) {
    return 'Enter your password.';
  }
  if (!EMAIL_RE.test(emailTrimmed)) {
    return 'That email address isn’t valid. Fix your email and try again.';
  }
  if (mode === 'signup' && password.length < 6) {
    return 'Your password must be at least 6 characters.';
  }
  return null;
}

type AuthErrLike = { message?: string; code?: string };

function describeAuthFailure(err: unknown, mode: Mode): string {
  const e = err as AuthErrLike;
  const rawMsg = e?.message ?? '';
  const msg = rawMsg.toLowerCase();
  const code = typeof e?.code === 'string' ? e.code : '';

  if (code === 'weak_password' || (msg.includes('password') && (msg.includes('weak') || msg.includes('least')))) {
    return 'Your password doesn’t meet the requirements. Try a stronger password.';
  }

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Confirm your email address before signing in.';
  }

  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    msg.includes('already registered') ||
    msg.includes('user already registered')
  ) {
    return 'That email is already registered. Try signing in instead.';
  }

  if (code === 'user_not_found') {
    return 'No account exists with this email address.';
  }

  if (
    code === 'invalid_credentials' ||
    msg.includes('invalid login credentials') ||
    msg.includes('invalid_credentials')
  ) {
    return mode === 'signin'
      ? 'Wrong password for this email, or no account uses this email. Check your password and email spelling.'
      : rawMsg || 'Something went wrong. Please try again.';
  }

  if (msg.includes('email') && !msg.includes('password')) {
    return rawMsg || 'There’s a problem with your email address.';
  }

  if (msg.includes('password')) {
    return rawMsg || 'There’s a problem with your password.';
  }

  return rawMsg || 'Something went wrong. Please try again.';
}

export function LoginPage({ onBack }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const emailTrimmed = email.trim();
    const clientErr = validateFields(emailTrimmed, password, mode);
    if (clientErr) {
      setError(clientErr);
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({ email: emailTrimmed, password });
        if (err) throw err;
        setInfo('Check your email for a confirmation link, then sign in.');
        setMode('signin');
      }
    } catch (err: unknown) {
      setError(describeAuthFailure(err, mode));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="onboarding-page login-page">
      <IntroBackButton onBack={onBack} />
      <header className="onboarding-header">
        <img src={`${import.meta.env.BASE_URL}toova-logo-cropped.png`} alt="Toova" className="onboarding-logo-img" />
      </header>
      <main className="onboarding-main">
        <div className="onboarding-card onboarding-login-heading">
          <div className="onboarding-tabs">
            <button
              type="button"
              className={`onboarding-tab${mode === 'signin' ? ' active' : ''}`}
              onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`onboarding-tab${mode === 'signup' ? ' active' : ''}`}
              onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
            >
              Create account
            </button>
          </div>

          {info ? <div className="onboarding-info-banner" role="status">{info}</div> : null}
          {error ? <div className="onboarding-error-banner" role="alert">{error}</div> : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="onboarding-form" noValidate>
            <label className="onboarding-label" htmlFor="lp-email">Email</label>
            <input
              id="lp-email"
              className="onboarding-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />

            <label className="onboarding-label" htmlFor="lp-password">Password</label>
            <input
              id="lp-password"
              className="onboarding-input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
            />

            <button
              type="submit"
              className="onboarding-btn onboarding-btn-primary"
              disabled={loading}
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
