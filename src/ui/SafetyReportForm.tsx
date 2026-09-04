import { useState } from 'react';
import { ReportDialog } from './ReportDialog';
import type { ContentReportTargetType } from '../lib/contentReports';
import { Field, Input, Button } from './kit';

/** Standing report form for /safety — works signed out. */
export function SafetyReportForm() {
  const [targetType, setTargetType] = useState<ContentReportTargetType>('other');
  const [targetId, setTargetId] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="safety-report-form">
      <h2 className="legal-page__heading">Submit a report</h2>
      <p className="legal-page__p">
        You do not need an account. Reports go to a human on the Toova safety team.
      </p>
      <Field label="What are you reporting?" htmlFor="safety-target-type">
        <select
          id="safety-target-type"
          className="kit-input"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as ContentReportTargetType)}
          style={{ width: '100%', height: 44, padding: '0 12px' }}
        >
          <option value="catalog_model">A 3D model (gallery)</option>
          <option value="room">A public room</option>
          <option value="profile">A profile</option>
          <option value="avatar">A profile photo</option>
          <option value="share">A share link</option>
          <option value="other">Something else</option>
        </select>
      </Field>
      <Field
        label="Link or ID"
        htmlFor="safety-target-id"
        hint="Paste a toova.net URL, model kind, room id, handle, or describe the target."
      >
        <Input
          id="safety-target-id"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder="https://toova.net/u/… or model id"
        />
      </Field>
      <Button
        size="md"
        disabled={!targetId.trim()}
        onClick={() => setOpen(true)}
        style={{ marginTop: 12 }}
      >
        Continue to report…
      </Button>
      <ReportDialog
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId.trim() || 'unspecified'}
        allowAnonymousEmail
        onSubmitted={() => setOpen(false)}
      />
    </div>
  );
}
