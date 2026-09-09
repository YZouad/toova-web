import { PRIVACY_VERSION, TERMS_VERSION } from '../legal';
import { supabase } from './supabase';

export type LegalAcceptMethod = 'signup_email' | 'signup_oauth' | 'gate' | 'reaccept';

export interface LegalStatus {
  accepted: boolean;
  needs_acceptance: boolean;
  is_minor: boolean | null;
  terms_version?: string;
  privacy_version?: string;
  current_terms_version: string;
  current_privacy_version: string;
}

const PENDING_KEY = 'toova-pending-legal-acceptance';

export interface PendingLegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  dob: string;
  method: LegalAcceptMethod;
  savedAt: number;
}

export function stashPendingLegalAcceptance(
  dob: string,
  method: LegalAcceptMethod,
): void {
  const payload: PendingLegalAcceptance = {
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    dob,
    method,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadPendingLegalAcceptance(): PendingLegalAcceptance | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLegalAcceptance;
    if (!parsed?.dob || !parsed.termsVersion) return null;
    // Expire after 2 hours
    if (Date.now() - (parsed.savedAt ?? 0) > 2 * 60 * 60 * 1000) {
      clearPendingLegalAcceptance();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingLegalAcceptance(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchLegalStatus(): Promise<LegalStatus> {
  const { data, error } = await supabase.rpc('get_own_legal_status');
  if (error) throw new Error(error.message);
  return data as LegalStatus;
}

export async function acceptLegalTerms(opts: {
  dob: string;
  method: LegalAcceptMethod;
  termsVersion?: string;
  privacyVersion?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('accept_legal_terms', {
    p_terms_version: opts.termsVersion ?? TERMS_VERSION,
    p_privacy_version: opts.privacyVersion ?? PRIVACY_VERSION,
    p_dob: opts.dob,
    p_method: opts.method,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 512) : null,
  });
  if (error) throw new Error(error.message);
  clearPendingLegalAcceptance();
}

/** Submit stashed OAuth acceptance after SIGNED_IN, if present and versions match. */
export async function flushPendingLegalAcceptance(): Promise<boolean> {
  const pending = loadPendingLegalAcceptance();
  if (!pending) return false;
  if (
    pending.termsVersion !== TERMS_VERSION
    || pending.privacyVersion !== PRIVACY_VERSION
  ) {
    clearPendingLegalAcceptance();
    return false;
  }
  await acceptLegalTerms({
    dob: pending.dob,
    method: pending.method,
    termsVersion: pending.termsVersion,
    privacyVersion: pending.privacyVersion,
  });
  return true;
}
