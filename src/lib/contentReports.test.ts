import { describe, expect, it } from 'vitest';
import {
  formatReportOwner,
  formatReportPerson,
  formatReportReporter,
  formatReportTarget,
  REPORT_REASON_OPTIONS,
  type ContentReportRow,
} from './contentReports';

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

describe('report display names', () => {
  const base: ContentReportRow = {
    id: 'rep-1',
    created_at: '2026-09-08T00:00:00.000Z',
    reporter_id: '791d872b-6a53-459c-8019-3c0319a05fe0',
    reporter_email: null,
    reporter_handle: 'yanis',
    reporter_display_name: 'Yanis',
    target_type: 'catalog_model',
    target_id: 'custom-55b1512f-b349-4c5f-8da6-d1232116d03d',
    target_label: 'Utility cart',
    target_owner_id: '3bdec469-f31d-4640-9118-48de8d5d5450',
    owner_handle: 'aeliyag',
    owner_display_name: 'Aeliyag',
    reason: 'inappropriate',
    details: null,
    status: 'new',
    evidence: {},
    reviewed_by: null,
    reviewed_at: null,
    resolution_note: null,
    ncmec_report_id: null,
    ncmec_reported_at: null,
    preserve_until: null,
  };

  it('puts names next to ids', () => {
    expect(formatReportTarget(base)).toBe(
      'Utility cart (catalog_model / custom-55b1512f-b349-4c5f-8da6-d1232116d03d)',
    );
    expect(formatReportOwner(base)).toBe(
      '@aeliyag (3bdec469-f31d-4640-9118-48de8d5d5450)',
    );
    expect(formatReportReporter(base)).toBe(
      '@yanis (791d872b-6a53-459c-8019-3c0319a05fe0)',
    );
    expect(formatReportPerson({
      id: 'uid-1',
      handle: 'fyodor',
      displayName: 'Fyodor Tenbarge',
    })).toBe('@fyodor · Fyodor Tenbarge (uid-1)');
  });

  it('falls back to evidence snapshot when list fields are missing', () => {
    const row: ContentReportRow = {
      ...base,
      target_label: null,
      reporter_handle: null,
      reporter_display_name: null,
      owner_handle: null,
      owner_display_name: null,
      evidence: {
        label: 'Monitor',
        reporter_handle: 'yanis',
        reporter_display_name: 'Yanis',
        owner_handle: 'aeliyag',
        owner_display_name: 'Aeliyag',
      },
    };
    expect(formatReportTarget(row)).toContain('Monitor');
    expect(formatReportReporter(row)).toContain('@yanis');
    expect(formatReportOwner(row)).toContain('@aeliyag');
  });

  it('keeps ids when no name is available', () => {
    expect(formatReportPerson({ id: 'abc-123' })).toBe('abc-123');
    expect(formatReportPerson({ anonymousLabel: 'anonymous' })).toBe('anonymous');
  });
});
