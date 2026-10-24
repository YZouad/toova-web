import { useState } from 'react';
import { deleteOwnAccount } from '../lib/accountDeletion';
import { openCookieSettings } from '../lib/cookieConsent';
import { supabase } from '../lib/supabase';
import { navigate, privacyPath } from '../hooks/useRoute';
import { Banner, Button, Field, Input, MonoMeta, SectionOpener } from './kit';

const CONFIRM_WORD = 'DELETE';

/** Owner-only privacy controls: cookie choice and permanent account deletion. */
export function AccountPrivacySettings() {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      await deleteOwnAccount();
      await supabase.auth.signOut();
      navigate('/', true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t delete your account. Please try again.');
      setBusy(false);
    }
  }

  return (
    <section className="profile-integrations" style={{ marginTop: 56 }}>
      <SectionOpener level={5} title="Privacy & account." note="Your data" />
      <div className="profile-edit-fields" style={{ marginTop: 20, maxWidth: 560 }}>
        <Field label="Cookies">
          <MonoMeta size="sm" tone="subtle" style={{ display: 'block', marginBottom: 12 }}>
            Change whether Toova may use analytics cookies on this browser. See our{' '}
            <a href={privacyPath()} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </MonoMeta>
          <div>
            <Button size="sm" variant="outline" onClick={openCookieSettings}>
              Cookie settings
            </Button>
          </div>
        </Field>

        <Field label="Delete account">
          <MonoMeta size="sm" tone="subtle" style={{ display: 'block', marginBottom: 12 }}>
            Permanently deletes your account, rooms, uploads, 3D models, and published copies, and
            cancels any web subscription. This can’t be undone. App Store subscriptions must be
            cancelled in your Apple ID settings.
          </MonoMeta>
          {confirming ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <Input
                value={confirmText}
                disabled={busy}
                placeholder={`Type ${CONFIRM_WORD} to confirm`}
                aria-label={`Type ${CONFIRM_WORD} to confirm account deletion`}
                onChange={(e) => setConfirmText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={busy || confirmText.trim() !== CONFIRM_WORD}
                  onClick={() => void handleDelete()}
                >
                  {busy ? 'Deleting…' : 'Permanently delete account'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setConfirmText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                Delete account…
              </Button>
            </div>
          )}
          {error ? <Banner tone="error">{error}</Banner> : null}
        </Field>
      </div>
    </section>
  );
}
