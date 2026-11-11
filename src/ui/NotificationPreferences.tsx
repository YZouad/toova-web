import { useEffect, useId, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences as Prefs,
} from '../lib/notificationPreferences';
import { Banner, Checkbox, MonoMeta } from './kit';

const CATEGORIES: Array<{ key: keyof Omit<Prefs, 'email_unsubscribed_all'>; label: string; hint: string }> =
  [
    { key: 'email_likes', label: 'Room likes', hint: 'When someone likes one of your rooms.' },
    { key: 'email_copies', label: 'Room copies', hint: 'When someone remixed one of your rooms.' },
    { key: 'email_model_ready', label: 'Model ready', hint: 'When a photo-to-3D job finishes.' },
    {
      key: 'email_finish_room',
      label: 'Room reminders',
      hint: 'Nudge when a new room still needs furniture.',
    },
    { key: 'email_credits', label: 'Credits refreshed', hint: 'When your monthly credits renew.' },
    {
      key: 'email_move_in',
      label: 'Move-in countdown',
      hint: 'Weekly checklist reminders before move-in.',
    },
  ];

/** Owner email preference toggles. Rendered inside a settings panel (no section chrome). */
export function NotificationPreferences({ userId }: { userId: string }) {
  const statusId = useId();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchNotificationPreferences(userId)
      .then((next) => {
        if (!cancelled) setPrefs(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load email preferences.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function save(patch: Partial<Prefs>, key: string) {
    const previous = prefs;
    const optimistic = { ...prefs, ...patch };
    setPrefs(optimistic);
    setSavingKey(key);
    setError(null);
    setStatus(null);
    try {
      const next = await updateNotificationPreferences(userId, patch);
      setPrefs(next);
      setStatus('Email preferences saved.');
    } catch (err) {
      setPrefs(previous);
      setError(err instanceof Error ? err.message : 'Could not save email preferences.');
    } finally {
      setSavingKey(null);
    }
  }

  const disabled = loading || savingKey != null;
  const categoriesDisabled = disabled || prefs.email_unsubscribed_all;

  return (
    <div className="notification-prefs">
      <MonoMeta size="sm" tone="subtle" className="notification-prefs__intro">
        These control lifecycle emails only. In-app alerts still appear in the notifications bell.
      </MonoMeta>

      {error ? (
        <Banner tone="error" className="notification-prefs__error">
          {error}
        </Banner>
      ) : null}

      <div className="notification-prefs__master">
        <Checkbox
          checked={!prefs.email_unsubscribed_all}
          disabled={disabled}
          ariaLabel="Send me Toova emails"
          label="Send me Toova emails"
          onChange={(checked) =>
            void save({ email_unsubscribed_all: !checked }, 'email_unsubscribed_all')
          }
        />
        <MonoMeta size="xs" tone="subtle" upper>
          Master switch
        </MonoMeta>
      </div>

      <div
        className={[
          'notification-prefs__categories',
          categoriesDisabled ? 'notification-prefs__categories--dimmed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-disabled={categoriesDisabled || undefined}
      >
        {CATEGORIES.map((category) => (
          <div key={category.key} className="notification-prefs__row">
            <Checkbox
              checked={prefs[category.key]}
              disabled={categoriesDisabled}
              label={
                <span className="notification-prefs__row-copy">
                  <strong className="notification-prefs__row-label">{category.label}</strong>
                  <span className="notification-prefs__row-hint">{category.hint}</span>
                </span>
              }
              onChange={(checked) => void save({ [category.key]: checked }, category.key)}
            />
          </div>
        ))}
      </div>

      <p id={statusId} className="notification-prefs__status" aria-live="polite">
        {loading ? 'Loading preferences…' : savingKey ? 'Saving…' : status}
      </p>
    </div>
  );
}
