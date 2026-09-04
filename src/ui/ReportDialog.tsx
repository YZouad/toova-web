import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  hasReportedTarget,
  REPORT_REASON_OPTIONS,
  submitContentReport,
  type ContentReportReason,
  type ContentReportTargetType,
} from '../lib/contentReports';

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ContentReportTargetType;
  targetId: string;
  targetLabel?: string;
  /** Allow anonymous email field (e.g. /safety standing form). */
  allowAnonymousEmail?: boolean;
  /** Compact inline mode without portal (embed in model detail). */
  inline?: boolean;
  onSubmitted?: (result: { id: string; quarantined: boolean }) => void;
}

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
  allowAnonymousEmail = false,
  inline = false,
  onSubmitted,
}: ReportDialogProps) {
  const titleId = useId();
  const [reason, setReason] = useState<ContentReportReason>('inappropriate');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(() => hasReportedTarget(targetType, targetId));

  useEffect(() => {
    if (open) {
      setDone(hasReportedTarget(targetType, targetId));
      setError(null);
      setBusy(false);
    }
  }, [open, targetType, targetId]);

  if (!open) return null;

  async function handleSubmit() {
    if (done || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitContentReport({
        targetType,
        targetId,
        reason,
        details,
        reporterEmail: allowAnonymousEmail ? email : null,
      });
      setDone(true);
      onSubmitted?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send report');
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className={inline ? 'report-dialog report-dialog--inline' : 'report-dialog'}>
      <div className="report-dialog__panel" role="dialog" aria-modal={!inline} aria-labelledby={titleId}>
        <div className="report-dialog__head">
          <h2 id={titleId} className="report-dialog__title">
            Report {targetLabel ? `“${targetLabel}”` : 'content'}
          </h2>
          {!inline ? (
            <button type="button" className="report-dialog__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          ) : null}
        </div>

        {done ? (
          <p className="report-dialog__done">
            Reported — thanks. This goes to a human on the safety team, not the creator.
          </p>
        ) : (
          <>
            <p className="report-dialog__hint">
              Goes to a human on the Toova safety team, not the creator.
            </p>
            <fieldset className="report-dialog__reasons" disabled={busy}>
              <legend>What&apos;s wrong?</legend>
              <div className="report-dialog__chips" role="group" aria-label="Report reason">
                {REPORT_REASON_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`report-dialog__chip${reason === r.value ? ' is-active' : ''}`}
                    onClick={() => setReason(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="report-dialog__field">
              <span>Details (optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={2000}
                rows={3}
                disabled={busy}
                placeholder="Links, context, or what you saw…"
              />
            </label>
            {allowAnonymousEmail ? (
              <label className="report-dialog__field">
                <span>Your email (optional, for follow-up)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  placeholder="you@example.com"
                />
              </label>
            ) : null}
            {error ? <p className="report-dialog__error">{error}</p> : null}
            <div className="report-dialog__actions">
              <button type="button" className="report-dialog__send" disabled={busy} onClick={() => void handleSubmit()}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
              {inline ? (
                <button type="button" className="report-dialog__cancel" disabled={busy} onClick={onClose}>
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (inline) return body;
  return createPortal(body, document.body);
}
