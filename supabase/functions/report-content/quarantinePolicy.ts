/** Pure auto-quarantine gating for report-content. */

export const AUTO_QUARANTINE_REASONS = new Set(["csam", "sexual_content"]);

export type QuarantineReporter = {
  id: string | null;
  emailConfirmed: boolean;
};

/**
 * Auto-hide only when a signed-in reporter with a verified email flags
 * CSAM / sexual content. Anonymous and unverified reports stay queued.
 */
export function shouldAutoQuarantine(
  reason: string,
  reporter: QuarantineReporter,
): boolean {
  if (!AUTO_QUARANTINE_REASONS.has(reason)) return false;
  if (!reporter.id) return false;
  if (!reporter.emailConfirmed) return false;
  return true;
}

export function autoQuarantineSkipNote(reporter: QuarantineReporter): string {
  if (!reporter.id) return "anonymous report, queued for review";
  if (!reporter.emailConfirmed) return "unverified reporter, queued for review";
  return "queued for review";
}
