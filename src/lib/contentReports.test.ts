import { describe, expect, it } from 'vitest';
import { REPORT_REASON_OPTIONS } from './contentReports';

/** Mirrors AUTO_QUARANTINE in supabase/functions/report-content. */
const AUTO_QUARANTINE = new Set(['csam', 'sexual_content']);

describe('content report reasons', () => {
  it('includes CSAM and sexual_content for auto-quarantine', () => {
    const values = REPORT_REASON_OPTIONS.map((r) => r.value);
    expect(values).toContain('csam');
    expect(values).toContain('sexual_content');
    for (const reason of AUTO_QUARANTINE) {
      expect(values).toContain(reason);
    }
  });

  it('lists CSAM first for reviewer visibility', () => {
    expect(REPORT_REASON_OPTIONS[0]?.value).toBe('csam');
  });
});
