import { LEGAL_ENTITY, TERMS_VERSION, operatorName, type LegalDocument } from './documents';

const operator = operatorName();
const contact = LEGAL_ENTITY.contactEmail;

export const TERMS_DOCUMENT: LegalDocument = {
  id: 'terms',
  version: TERMS_VERSION,
  effectiveDate: TERMS_VERSION,
  title: 'Terms of Service',
  sections: [
    {
      heading: 'About these Terms',
      body: [
        `These Terms of Service (“Terms”) are an agreement between you and ${operator} (“Toova”, “we”, “us”) covering your use of the Toova website, iOS app, and related services (the “Service”).`,
        ...(LEGAL_ENTITY.postalAddress ? [`Mailing address: ${LEGAL_ENTITY.postalAddress}`] : []),
      ],
    },
    {
      heading: '1. Acceptance of terms',
      body: [
        'By creating a Toova account or clicking “I agree,” you agree to these Terms and our Privacy Policy. If you do not agree, do not use Toova.',
        'You must be at least 13 years old to use Toova. If you are between 13 and 17, you represent that a parent or guardian has reviewed and agreed to these Terms on your behalf.',
      ],
    },
    {
      heading: '2. Your account',
      body: [
        'Give accurate information, keep your password secure, and tell us if you think your account has been compromised. You are responsible for activity on your account.',
        'You can delete your account at any time from your profile. Deleting your account does not cancel an App Store subscription; manage that in your Apple ID settings.',
      ],
    },
    {
      heading: '3. The service',
      body: [
        'Toova provides tools to plan rooms in 3D, scan rooms, turn photos into 3D models, share designs, and browse a community gallery. Features may change, and we may suspend or discontinue parts of the Service.',
        'Room dimensions, AI-generated models, and product fit previews are estimates. Check measurements and product details with the retailer before you buy.',
      ],
    },
    {
      heading: '4. Your content',
      body: [
        'You keep ownership of the photos, scans, models, and designs you upload or create (“Your Content”).',
        'You grant Toova a worldwide, non-exclusive, royalty-free license to host, store, process, reproduce, and display Your Content as needed to operate and improve the Service, including sending it to our AI service providers to generate models. When you make content public or create a share link, you also allow others to view it through the Service. This license ends when you delete the content or your account, except for copies others have already saved from public pages or that we must keep by law.',
        'You confirm you have the rights to upload Your Content and that it does not infringe anyone else’s rights, including privacy rights of people who appear in your photos.',
      ],
    },
    {
      heading: '5. Acceptable use',
      body: [
        'You must not upload or share: child sexual abuse material or any sexual content involving minors; content that is illegal, harassing, hateful, sexually explicit, or violent; images of other people shared without their consent; malware; or content that infringes intellectual property.',
        'You must not misuse the Service, including scraping it, interfering with its operation, bypassing usage limits or age checks, reselling access, or using it to train competing AI models.',
        'We may remove content, restrict features, or suspend or terminate accounts that violate these Terms. We report apparent child sexual abuse material to NCMEC and law enforcement as required by law.',
      ],
    },
    {
      heading: '6. Reporting and blocking',
      body: [
        'Report content or users that break these Terms with the in-product Report controls, at toova.net/safety, or by email. You can block another user so their public content no longer appears to you.',
        'We aim to review reports promptly and act on content that violates these Terms within 24 hours of confirming the violation.',
      ],
    },
    {
      heading: '7. Purchases and subscriptions',
      body: [
        'Some features require a paid subscription or credits. Prices are shown before purchase. Subscriptions renew automatically at the end of each period unless cancelled at least 24 hours before renewal.',
        'Web purchases are processed by Stripe and can be managed from Billing in your account. iOS purchases are processed by Apple, billed to your Apple ID, and managed in your App Store account settings; Apple’s refund policies apply to them.',
        'Except where required by law, payments are non-refundable and unused credits have no cash value.',
      ],
    },
    {
      heading: '8. Third-party links and services',
      body: [
        'Toova links to products sold by third parties such as Amazon. As an Amazon Associate, Toova earns from qualifying purchases. We are not responsible for third-party products, prices, or sites. If you connect a third-party service such as Thrixel, its own terms apply to that service.',
      ],
    },
    {
      heading: '9. Disclaimers and limitation of liability',
      body: [
        'The Service is provided “as is” and “as available” without warranties of any kind, to the fullest extent permitted by law.',
        'To the fullest extent permitted by law, Toova will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or data. Our total liability for any claim relating to the Service is limited to the greater of the amount you paid us in the 12 months before the claim or US $50. Some jurisdictions do not allow these limits, so they may not apply to you.',
      ],
    },
    {
      heading: '10. Termination',
      body: [
        'You may stop using Toova and delete your account at any time. We may suspend or end your access if you violate these Terms or if required by law. Sections that by their nature should survive termination will survive.',
      ],
    },
    {
      heading: '11. Changes',
      body: [
        'We may update these Terms. If changes are material, we will ask you to accept the updated Terms before you continue using Toova.',
      ],
    },
    {
      heading: '12. Contact',
      body: [
        `Questions about these Terms: ${contact}`,
        `Safety reports: toova.net/safety or ${contact}`,
      ],
    },
  ],
};
