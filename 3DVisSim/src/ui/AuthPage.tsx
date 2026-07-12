import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

interface AuthPageProps {
  onBack: () => void;
  initialMode?: Mode;
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
  return rawMsg || 'Something went wrong. Please try again.';
}

export function AuthPage({ onBack, initialMode = 'signin' }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
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
    if (clientErr) { setError(clientErr); return; }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: emailTrimmed, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({
          email: emailTrimmed,
          password,
          options: name.trim() ? { data: { full_name: name.trim() } } : undefined,
        });
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
    <div className="auth-page">
      <div className="auth-brand">
        <button type="button" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: 'none', border: 'none', position: 'relative', zIndex: 2, padding: 0 }}>
          <div className="tv-logo-mark" style={{ width: 26, height: 26, borderRadius: 7, fontSize: 17 }}>t</div>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 23, fontWeight: 600, color: '#F8F3EA' }}>Toova</span>
        </button>
        <div style={{ position: 'relative', zIndex: 2 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 42, lineHeight: 1.1, color: '#F8F3EA', margin: '0 0 16px', maxWidth: 380 }}>
            Photos become furniture. Rooms become yours.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(248,243,234,.65)', maxWidth: 340, lineHeight: 1.55 }}>
            Pick up where thousands of designers left off — your saved rooms are waiting.
          </p>
        </div>
        <div style={{ position: 'relative', zIndex: 2, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(244,238,228,.4)' }}>v2.4 · spatial styling</div>
        <div className="auth-brand-glow" />
      </div>

      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <h1 className="auth-title">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth-sub">
            {mode === 'signin' ? 'Sign in to access your saved rooms.' : 'Start designing rooms in minutes.'}
          </p>

          {info ? <div className="tv-banner-info" role="status">{info}</div> : null}
          {error ? <div className="tv-banner-error" role="alert">{error}</div> : null}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            {mode === 'signup' ? (
              <>
                <label className="tv-label" htmlFor="auth-name">Full name</label>
                <input id="auth-name" className="tv-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maya Chen" style={{ marginBottom: 16 }} />
              </>
            ) : null}
            <label className="tv-label" htmlFor="auth-email">Email</label>
            <input id="auth-email" className="tv-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" style={{ marginBottom: 16 }} />
            <label className="tv-label" htmlFor="auth-pass">Password</label>
            <input id="auth-pass" className="tv-input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ marginBottom: 24 }} />
            <button type="submit" className="tv-btn-primary" style={{ width: '100%', padding: 14, borderRadius: 10 }} disabled={loading}>
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" className="auth-switch-link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}>
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
          <div className="auth-back">
            <button type="button" onClick={onBack}>← Back to home</button>
          </div>
        </div>
      </div>
    </div>
  );
}
