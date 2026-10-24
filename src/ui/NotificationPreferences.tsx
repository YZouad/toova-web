import { useEffect, useId, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences as Prefs,
} from '../lib/notificationPreferences';
import { Banner, Checkbox, Field, MonoMeta, SectionOpener } from './kit';

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
    <section className="notification-prefs" style={{ marginTop: 56 }}>
      <SectionOpener level={5} title="Email notifications." note="Inbox preferences" />
      <MonoMeta size="sm" tone="subtle" style={{ display: 'block', marginTop: 8, maxWidth: 52 * 8 }}>
        These control lifecycle emails only. In-app alerts still appear in the notifications bell.
      </MonoMeta>

      {error ? (
        <Banner tone="error" style={{ marginTop: 16 }}>
          {error}
        </Banner>
      ) : null}

      <div className="notification-prefs__list" style={{ marginTop: 20, maxWidth: 560 }}>
        <Field label="Master switch">
          <Checkbox
            checked={!prefs.email_unsubscribed_all}
            disabled={disabled}
            ariaLabel="Send me Toova emails"
            label="Send me Toova emails"
            onChange={(checked) =>
              void save({ email_unsubscribed_all: !checked }, 'email_unsubscribed_all')
            }
          />
        </Field>

        <div
          className="notification-prefs__categories"
          style={{ display: 'grid', gap: 14, marginTop: 18 }}
          aria-disabled={categoriesDisabled || undefined}
        >
          {CATEGORIES.map((category) => (
            <Checkbox
              key={category.key}
              checked={prefs[category.key]}
              disabled={categoriesDisabled}
              label={
                <span>
                  <strong style={{ display: 'block', fontSize: 13 }}>{category.label}</strong>
                  <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>{category.hint}</span>
                </span>
              }
              onChange={(checked) => void save({ [category.key]: checked }, category.key)}
            />
          ))}
        </div>

        <p id={statusId} className="notification-prefs__status" aria-live="polite">
          {loading ? 'Loading preferences…' : savingKey ? 'Saving…' : status}
        </p>
      </div>
    </section>
  );
}
