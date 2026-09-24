import { TERMS_VERSION, type LegalDocument } from './documents';

/**
 * TODO(legal): Replace placeholder body with the Google Drive Terms draft.
 * Fill entity name, mailing address, and effective date before public launch.
 */
export const TERMS_DOCUMENT: LegalDocument = {
  id: 'terms',
  version: TERMS_VERSION,
  effectiveDate: '2026-09-23',
  title: 'Terms of Service',
  sections: [
    {
      heading: 'Placeholder notice',
      body: [
        'TODO(legal): This is a structural placeholder. Paste the approved Terms of Service from Google Drive (Toova / Structural Documents) before treating this page as the live contract.',
        'Entity name: [TODO — legal entity name]',
        'Mailing address: [TODO — registered mailing address]',
        'Effective date: 2026-09-23 (update when counsel finalizes).',
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
      heading: '3. Paid plans, credits, and billing',
      body: [
        'Toova may offer paid subscription plans (for example Lite and Studio) and optional one-time credit packs. Plan features, credit allowances, and prices are described at checkout and on the Pricing page.',
        'Subscriptions renew automatically at the end of each billing period until you cancel. You can manage or cancel a subscription through the billing portal linked from your account. Cancellation takes effect at the end of the current paid period; you keep plan benefits until then.',
        'Subscription credit grants expire at the end of the billing period in which they were granted. Credits purchased as one-time packs do not expire unless we state otherwise at purchase.',
        'You must be at least 18 years old to purchase a paid plan or credit pack. Accounts marked as minors cannot complete checkout.',
        'Applicable sales tax or VAT may be collected at checkout where required by law.',
      ],
    },
    {
      heading: '4. Refunds and chargebacks',
      body: [
        'Except where required by law, subscription fees and credit-pack purchases are non-refundable once charged. If a charge fails or a payment method is declined, we may suspend paid benefits until payment succeeds.',
        'If you believe you were charged in error, contact ag@toova.net within 14 days of the charge. We may issue a refund or credit at our discretion, including for duplicate charges or clear service outages attributable to us.',
        'Initiating a chargeback without first contacting us may result in suspension of paid features while the dispute is resolved.',
      ],
    },
    {
      heading: '5. User content and conduct',
      body: [
        'You are responsible for content you upload, including photos, 3D models, room layouts, and profile information.',
        'You must not upload illegal content, including child sexual abuse material. We may remove content, suspend accounts, and report apparent CSAM to NCMEC and law enforcement as required by law.',
        'Report suspected illegal or harmful content at /safety or via in-product Report controls.',
      ],
    },
    {
      heading: '6. Contact',
      body: [
        'Questions about these Terms or billing: ag@toova.net',
        'Safety reports: ag@toova.net',
      ],
    },
  ],
};
