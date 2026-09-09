export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  id: 'terms' | 'privacy' | 'child-safety';
  version: string;
  effectiveDate: string;
  title: string;
  sections: LegalSection[];
}

/** Keep in sync with public.current_terms_version() in legal_acceptance migration. */
export const TERMS_VERSION = '2026-09-04';

/** Keep in sync with public.current_privacy_version() in legal_acceptance migration. */
export const PRIVACY_VERSION = '2026-09-04';

export const CHILD_SAFETY_VERSION = '2026-09-04';

export function needsLegalAcceptance(
  acceptedTerms: string | null | undefined,
  acceptedPrivacy: string | null | undefined,
): boolean {
  return acceptedTerms !== TERMS_VERSION || acceptedPrivacy !== PRIVACY_VERSION;
}
