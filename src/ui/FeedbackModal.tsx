import { type FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type FeedbackPageSource = 'landing' | 'dashboard' | 'designer' | 'contact';
export type FeedbackCategory = 'bug' | 'feedback' | 'other';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  pageSource: FeedbackPageSource;
  defaultEmail?: string;
  userId?: string | null;
}

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'other', label: 'Other' },
];

export function FeedbackModal({
  open,
  onClose,
  pageSource,
  defaultEmail = '',
  userId: _userId = null,
}: FeedbackModalProps) {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategory('bug');
    setEmail(defaultEmail);
    setMessage('');
    setError(null);
    setSuccess(false);
    setSubmitting(false);
  }, [open, defaultEmail]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setError('Please describe what happened or what you need help with.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const emailTrimmed = email.trim();
      const { error: insertErr } = await supabase.rpc('submit_feedback', {
        p_message: trimmed,
        p_category: category,
        p_page_source: pageSource,
        p_email: emailTrimmed || null,
        p_user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (insertErr) throw insertErr;
      setSuccess(true);
      window.setTimeout(() => onClose(), 1400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send your report. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="checklist-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="checklist-modal feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        <button
          type="button"
          className="checklist-modal-close"
          onClick={onClose}
          aria-label="Close"
          disabled={submitting}
        >
          ×
        </button>
        <p className="checklist-modal-eyebrow">Customer support</p>
        <h2 id="feedback-modal-title" className="checklist-modal-title">
          Send feedback
        </h2>
        <p className="checklist-modal-hint">
          Report a bug or share what we could do better. We read every submission.
        </p>

        {success ? (
          <div className="tv-banner-info feedback-modal-success" role="status">
            Thanks — we got your message.
          </div>
        ) : (
          <form className="feedback-modal-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            {error ? <div className="tv-banner-error" role="alert">{error}</div> : null}

            <label className="tv-label" htmlFor="feedback-category">Type</label>
            <select
              id="feedback-category"
              className="tv-input feedback-modal-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
              disabled={submitting}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <label className="tv-label" htmlFor="feedback-email">Email (optional)</label>
            <input
              id="feedback-email"
              className="tv-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              disabled={submitting}
            />

            <label className="tv-label" htmlFor="feedback-message">Message</label>
            <textarea
              id="feedback-message"
              className="tv-input feedback-modal-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What went wrong? What were you trying to do?"
              rows={4}
              disabled={submitting}
            />

            <div className="checklist-modal-footer checklist-modal-footer--teaser">
              <button type="submit" className="tv-btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit'}
              </button>
              <button type="button" className="checklist-modal-dismiss" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
