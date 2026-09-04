import { useState } from 'react';
import type { ContentReportRow } from '../lib/contentReports';
import { useContentReports } from '../hooks/useContentReports';
import { Banner, Button, Field, Input, RuledTable } from './kit';

export function AdminReportsPanel({ enabled }: { enabled: boolean }) {
  const {
    reports,
    total,
    unreviewed,
    loading,
    error,
    statusFilter,
    reasonFilter,
    setStatusFilter,
    setReasonFilter,
    refetch,
    act,
    loadEvidence,
  } = useContentReports(enabled);

  const [selected, setSelected] = useState<ContentReportRow | null>(null);
  const [note, setNote] = useState('');
  const [ncmecId, setNcmecId] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function openReport(row: ContentReportRow) {
    setSelected(row);
    setNote('');
    setNcmecId('');
    setActionError(null);
    setEvidenceUrls({});
    try {
      const ev = await loadEvidence(row.id);
      setEvidenceUrls(ev.urls);
      if (row.status === 'new') {
        await act({ reportId: row.id, action: 'reviewing' });
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not load evidence');
    }
  }

  async function run(action: Parameters<typeof act>[0]['action']) {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await act({
        reportId: selected.id,
        action,
        note: note || null,
        ncmecReportId: action === 'escalate_ncmec' ? ncmecId : null,
      });
      setSelected(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-reports">
      <div className="admin-reports__toolbar">
        <div className="admin-reports__stat">
          <span>Unreviewed</span>
          <strong>{unreviewed}</strong>
        </div>
        <div className="admin-reports__stat">
          <span>Showing</span>
          <strong>
            {reports.length} / {total}
          </strong>
        </div>
        <label className="admin-reports__filter">
          Status
          <select
            value={statusFilter ?? 'all'}
            onChange={(e) => setStatusFilter(e.target.value === 'all' ? 'all' : e.target.value)}
          >
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
            <option value="escalated_ncmec">Escalated NCMEC</option>
          </select>
        </label>
        <label className="admin-reports__filter">
          Reason
          <select
            value={reasonFilter ?? ''}
            onChange={(e) => setReasonFilter(e.target.value || null)}
          >
            <option value="">All</option>
            <option value="csam">CSAM</option>
            <option value="sexual_content">Sexual content</option>
            <option value="harassment">Harassment</option>
            <option value="inappropriate">Inappropriate</option>
            <option value="spam">Spam</option>
            <option value="stolen">Stolen</option>
            <option value="other">Other</option>
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {actionError ? <Banner tone="error">{actionError}</Banner> : null}

      {loading && reports.length === 0 ? (
        <p>Loading reports…</p>
      ) : (
        <RuledTable
          columns={[
            { label: '', align: 'left' },
            { label: 'When', align: 'left' },
            { label: 'Reason', align: 'left' },
            { label: 'Target', align: 'left' },
            { label: 'Status', align: 'left' },
            { label: '', align: 'right' },
          ]}
          rows={reports.map((r) => [
            r.reason === 'csam' || r.reason === 'sexual_content' ? '!' : '',
            new Date(r.created_at).toLocaleString(),
            r.reason,
            `${r.target_type} / ${r.target_id}`,
            r.status,
            <Button key={r.id} size="sm" variant="outline" onClick={() => void openReport(r)}>
              Open
            </Button>,
          ])}
        />
      )}

      {selected ? (
        <div className="admin-reports__detail" role="dialog" aria-label="Report detail">
          <div className="admin-reports__detail-card">
            <header className="admin-reports__detail-head">
              <h3>
                {selected.reason} · {selected.target_type}
              </h3>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
            </header>
            <p className="admin-reports__meta">
              ID {selected.id}
              <br />
              Target {selected.target_id}
              <br />
              Owner {selected.target_owner_id ?? '—'}
              <br />
              Reporter {selected.reporter_id ?? selected.reporter_email ?? 'anonymous'}
            </p>
            {selected.details ? <p className="admin-reports__details">{selected.details}</p> : null}

            <div className="admin-reports__evidence">
              <p className="admin-reports__warn">
                Do not download, forward, or re-host reported media. View only here.
              </p>
              {evidenceUrls.thumbnail ? (
                <img src={evidenceUrls.thumbnail} alt="" className="admin-reports__thumb" />
              ) : null}
              {evidenceUrls.avatar ? (
                <img src={evidenceUrls.avatar} alt="" className="admin-reports__thumb" />
              ) : null}
              {evidenceUrls.model ? (
                <a href={evidenceUrls.model} target="_blank" rel="noopener noreferrer">
                  Open model URL (signed)
                </a>
              ) : null}
              <pre className="admin-reports__json">
                {JSON.stringify(selected.evidence, null, 2)}
              </pre>
            </div>

            <Field label="Resolution note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
            </Field>
            <Field label="CyberTipline report ID (required to escalate)">
              <Input value={ncmecId} onChange={(e) => setNcmecId(e.target.value)} disabled={busy} />
            </Field>

            <div className="admin-reports__actions">
              <Button size="sm" disabled={busy} onClick={() => void run('quarantine')}>
                Quarantine
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('restore')}>
                Restore
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run('dismiss')}>
                Dismiss
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void run('action')}>
                Mark actioned
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void run('ban_uploader')}>
                Ban uploader
              </Button>
              <Button
                size="sm"
                disabled={busy || ncmecId.trim().length < 3}
                onClick={() => void run('escalate_ncmec')}
              >
                Mark escalated to NCMEC
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
