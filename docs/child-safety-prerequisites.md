# Child safety — operational prerequisites

These items are **not** code. They must be completed for the reporting and NCMEC
pipeline to discharge 18 U.S.C. §2258A. Shipping product UI without them leaves
the gap open.

## 1. Monitored safety inbox

- Create and monitor **`safety@toova.net`**.
- Name a primary owner and a backup.
- Agree a response SLA (target: triage CSAM-flagged reports within **24 hours**,
  other reports within **72 hours**).
- Route alerts from the `report-content` Edge Function to this address
  (`SAFETY_ALERT_TO` secret).

## 2. NCMEC Electronic Service Provider registration

- Register Toova as an Electronic Service Provider with NCMEC so CyberTipline
  reports can be filed: https://report.cybertip.org/
- Store the CyberTipline report ID on each escalated row via AdminConsole
  (“Mark escalated to NCMEC”).
- Do **not** claim NCMEC reporting publicly until registration is complete and
  at least one dry-run filing has succeeded.

## 3. Transactional email (Resend)

Provision a Resend (or equivalent) API key and set Edge Function secrets:

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set SAFETY_ALERT_TO=safety@toova.net
supabase secrets set SAFETY_ALERT_FROM="Toova Safety <alerts@toova.net>"
```

Until `RESEND_API_KEY` is set, `report-content` still inserts the report and
quarantines CSAM targets, but email delivery logs a warning. Confirm a live
end-to-end alert before calling Track A done.

## 4. Deploy functions

```bash
supabase functions deploy report-content
supabase functions deploy sign-report-evidence
```

`report-content` has `verify_jwt = false` so signed-out `/safety` reports work;
the function verifies a JWT when present and rate-limits by user or IP.
