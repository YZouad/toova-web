import { PRIVACY_VERSION, type LegalDocument } from './documents';

/**
 * TODO(legal): Replace placeholder body with the Google Drive Privacy draft.
 * Fill entity name, mailing address, and effective date before public launch.
 */
export const PRIVACY_DOCUMENT: LegalDocument = {
  id: 'privacy',
  version: PRIVACY_VERSION,
  effectiveDate: '2026-09-04',
  title: 'Privacy Policy',
  sections: [
    {
      heading: 'Placeholder notice',
      body: [
        'TODO(legal): This is a structural placeholder. Paste the approved Privacy Policy from Google Drive (Toova / Structural Documents) before treating this page as the live notice.',
        'Entity name: [TODO — legal entity name]',
        'Mailing address: [TODO — registered mailing address]',
        'Effective date: 2026-09-04 (update when counsel finalizes).',
      ],
    },
    {
      heading: '1. What we collect',
      body: [
        'Account data (email, display name, handle), date of birth (used only for age eligibility and minor status — not shown on public profiles), content you upload, and usage analytics without email/name as event parameters.',
      ],
    },
    {
      heading: '2. How we use data',
      body: [
        'To operate Toova, secure accounts, enforce our Terms, review safety reports, and improve the product.',
      ],
    },
    {
      heading: '3. Sharing',
      body: [
        'We may share information with service providers (e.g. hosting, email), when required by law, or when reporting apparent CSAM to NCMEC.',
      ],
    },
    {
      heading: '4. Contact',
      body: [
        'Privacy questions: ag@toova.net',
      ],
    },
  ],
};
