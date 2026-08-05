import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
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
  StatRow,
  Tabs,
} from './kit';

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
    <div className="auth-page">
      <div className="toova-paper" aria-hidden />

      <div className="auth-poster">
        <Logo size={21} onClick={onBack} />
        <div style={{ marginTop: 'auto' }}>
          <Eyebrow level="page" style={{ marginBottom: 32 }}>
            Toova — a room planner
          </Eyebrow>
          <DisplayHeading level={3}>
            Own it
            <br />
            before you
            <br />
            <DisplayEm>buy</DisplayEm> it.
          </DisplayHeading>
          <div style={{ marginTop: 44, paddingTop: 22, borderTop: '1px solid var(--rule-heavy)' }}>
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
            style={{ marginBottom: 32 }}
            tabs={[
              { id: 'signin', label: 'Sign in' },
              { id: 'signup', label: 'Create account' },
            ]}
          />

          {info ? <Banner tone="info" style={{ marginBottom: 22 }}>{info}</Banner> : null}
          {error ? <Banner tone="error" style={{ marginBottom: 22 }}>{error}</Banner> : null}

          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <Field label="Email">
                <Input
                  id="lp-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Field
                label="Password"
                hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
              >
                <Input
                  id="lp-password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                />
              </Field>
              <Button size="md" full type="submit" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </Button>
              <div className="auth-form-footer">
                <Button variant="mono" type="button">
                  Forgot password →
                </Button>
                <MonoMeta size="sm" tone="subtle" upper>
                  No card to start
                </MonoMeta>
              </div>
            </div>
          </form>

          {onBack ? (
            <div className="auth-back-row">
              <button type="button" onClick={onBack}>
                ← Back to home
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
