import { TERMS_VERSION, type LegalDocument } from './documents';

/**
 * TODO(legal): Replace placeholder body with the Google Drive Terms draft.
 * Fill entity name, mailing address, and effective date before public launch.
 */
export const TERMS_DOCUMENT: LegalDocument = {
  id: 'terms',
  version: TERMS_VERSION,
  effectiveDate: '2026-09-04',
  title: 'Terms of Service',
  sections: [
    {
      heading: 'Placeholder notice',
      body: [
        'TODO(legal): This is a structural placeholder. Paste the approved Terms of Service from Google Drive (Toova / Structural Documents) before treating this page as the live contract.',
        'Entity name: [TODO — legal entity name]',
        'Mailing address: [TODO — registered mailing address]',
        'Effective date: 2026-09-04 (update when counsel finalizes).',
      ],
    },
    {
      heading: '1. Acceptance of terms',
      body: [
        'By creating a Toova account or clicking “I agree,” you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use Toova.',
        'You must be at least 13 years old to use Toova. If you are between 13 and 17, you represent that a parent or guardian has reviewed and agreed to these Terms on your behalf.',
      ],
    },
    {
      heading: '2. The service',
      body: [
        'Toova provides tools to plan rooms in 3D, upload and share models, and browse a community gallery. Features may change.',
      ],
    },
    {
      heading: '3. User content and conduct',
      body: [
        'You are responsible for content you upload, including photos, 3D models, room layouts, and profile information.',
        'You must not upload illegal content, including child sexual abuse material. We may remove content, suspend accounts, and report apparent CSAM to NCMEC and law enforcement as required by law.',
        'Report suspected illegal or harmful content at /safety or via in-product Report controls.',
      ],
    },
    {
      heading: '4. Contact',
      body: [
        'Questions about these Terms: ag@toova.net',
        'Safety reports: safety@toova.net',
      ],
    },
  ],
};
