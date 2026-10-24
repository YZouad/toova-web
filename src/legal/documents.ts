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

/**
 * Operator identity shown in the Terms and Privacy Policy. Set `legalName` to the
 * registered entity (e.g. "Toova LLC") and `postalAddress` to its mailing address;
 * lines with an empty value are omitted from the published documents.
 */
export const LEGAL_ENTITY = {
  legalName: 'Toova Inc.',
  postalAddress: '',
  contactEmail: 'ag@toova.net',
} as const;

export function operatorName(): string {
  return LEGAL_ENTITY.legalName || 'Toova';
}

/** Keep in sync with public.current_terms_version() in the latest legal migration. */
export const TERMS_VERSION = '2026-10-24';

/** Keep in sync with public.current_privacy_version() in the latest legal migration. */
export const PRIVACY_VERSION = '2026-10-24';

export const CHILD_SAFETY_VERSION = '2026-09-04';

export function needsLegalAcceptance(
  acceptedTerms: string | null | undefined,
  acceptedPrivacy: string | null | undefined,
): boolean {
  return acceptedTerms !== TERMS_VERSION || acceptedPrivacy !== PRIVACY_VERSION;
}
