import { CHILD_SAFETY_VERSION, type LegalDocument } from './documents';

/**
 * Public child-safety statement — only describe capabilities that exist.
 * Do not claim NCMEC filing until ESP registration is complete
 * (see docs/child-safety-prerequisites.md).
 */
export const CHILD_SAFETY_DOCUMENT: LegalDocument = {
  id: 'child-safety',
  version: CHILD_SAFETY_VERSION,
  effectiveDate: '2026-09-04',
  title: 'Child Safety',
  sections: [
    {
      heading: 'Our commitment',
      body: [
        'Toova does not allow child sexual abuse material (CSAM) or sexual content involving minors. Users must be at least 13 years old.',
      ],
    },
    {
      heading: 'How to report',
      body: [
        'Use the Report control on models, rooms, and profiles, or submit a report on this page. Reports go to a human on the Toova safety team — not to the content creator.',
        'You can report while signed out. Include as much detail as you can (link, description, why it concerns you).',
        'Email: safety@toova.net',
      ],
    },
    {
      heading: 'What happens next',
      body: [
        'Reports of CSAM or sexual content are auto-hidden from public galleries while we review.',
        'We review reports in our admin tools, may remove content or restrict accounts, and preserve evidence as required by law when escalating to authorities.',
        'If you believe a child is in immediate danger, contact local law enforcement.',
      ],
    },
  ],
};
