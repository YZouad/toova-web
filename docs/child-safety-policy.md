# Child safety policy (internal)

**Audience:** Toova staff with admin access.  
**Related:** [child-safety-prerequisites.md](./child-safety-prerequisites.md), public `/safety` page.

This document describes how we handle reports of illegal or harmful content,
including apparent child sexual abuse material (CSAM). It is an internal
runbook — not legal advice. Engage counsel for NCMEC program design.

## Inbox ownership

| Role | Responsibility |
|------|----------------|
| Primary safety owner | Monitors `safety@toova.net`, triages AdminConsole Reports queue |
| Backup | Covers weekends / absence |
| Engineering admin | Can restore quarantined content after a false positive |

## Review SLA

| Report reason | Triage target |
|---------------|---------------|
| `csam` | Within **24 hours** (auto-quarantined on submit) |
| `sexual_content` | Within **24 hours** (auto-quarantined on submit) |
| Other | Within **72 hours** |

## Workflow

1. Alert arrives at `safety@toova.net` and the report appears in AdminConsole → Reports.
2. Open the report. Evidence is shown via short-lived signed URLs — **do not
   download, forward, screenshot, or re-host** reported media.
3. Decide:
   - **Dismiss** — false positive / not actionable. Restore if auto-quarantined.
   - **Action** — remove content, optionally ban the uploader.
   - **Escalate to NCMEC** — file a CyberTipline report, paste the report ID
     into AdminConsole. Sets `preserve_until = now() + 90 days`.

## CyberTipline filing

1. Confirm NCMEC ESP registration is active (see prerequisites).
2. File at https://report.cybertip.org/ with the facts available in AdminConsole
   (URLs, timestamps, user IDs — not the binary media itself unless NCMEC
   requests it through the official channel).
3. Record the CyberTipline report ID on the row via **Mark escalated to NCMEC**.

## 90-day preservation (§2258A)

Once escalated, related storage objects must not be hard-deleted until
`preserve_until` has passed. The database blocks deletes of catalog models /
rooms that are under an active preservation window.

## Staff handling rules

- Never view reported CSAM outside the AdminConsole evidence viewer.
- Never copy reported media to Slack, email, disk, or personal devices.
- Limit access to the `admins` table to people who need it.
- If law enforcement contacts Toova, escalate to counsel before responding;
  preserve the report row and do not alter evidence.

## Public messaging

The public `/safety` page must only describe capabilities that exist today.
Do not promise NCMEC reporting until ESP registration and a successful dry-run
filing are complete.
