import { LEGAL_ENTITY, PRIVACY_VERSION, operatorName, type LegalDocument } from './documents';

const operator = operatorName();
const contact = LEGAL_ENTITY.contactEmail;

export const PRIVACY_DOCUMENT: LegalDocument = {
  id: 'privacy',
  version: PRIVACY_VERSION,
  effectiveDate: PRIVACY_VERSION,
  title: 'Privacy Policy',
  sections: [
    {
      heading: 'Who we are',
      body: [
        `This Privacy Policy explains how ${operator} (“Toova”, “we”, “us”) collects, uses, and shares personal information when you use the Toova website at toova.net, the Toova iOS app, and related services (together, the “Service”). We are the controller of the personal information described here.`,
        ...(LEGAL_ENTITY.postalAddress ? [`Mailing address: ${LEGAL_ENTITY.postalAddress}`] : []),
        `Contact for privacy questions and requests: ${contact}`,
      ],
    },
    {
      heading: '1. Information we collect',
      body: [
        'Account information: your email address, password (stored hashed by our authentication provider), display name, handle, and profile photo. If you sign in with Apple, Google, or Facebook, we receive the name, email address, and profile picture that provider shares with us.',
        'Age information: the month and year of your birth. We use it only to confirm you are old enough to use Toova and whether you are a minor (under 18). It is never shown on your profile.',
        'Content you create or upload: photos, room scans (including camera images and LiDAR room geometry captured on iPhone), 3D models, room layouts, shopping lists, comments on your rooms, and anything else you upload or generate. Photos you upload may show people or personal items in your home; please avoid uploading images of other people without their permission.',
        'Purchases: if you buy a subscription or credits, Stripe (web) or Apple (iOS) processes the payment. We receive your plan, transaction identifiers, amounts, and status — never your full card number.',
        'Device and technical information: push-notification tokens (iOS, if you allow notifications), browser or app version, and, when you submit a safety report, the IP address and user agent of the request so we can investigate abuse.',
        'Analytics (only with your consent on the web): if you accept analytics cookies, we record page views, sessions, and feature events in Google Analytics 4 and in our own analytics store. These events never contain your email or name. The iOS app does not include third-party analytics or advertising SDKs and does not track you across other companies’ apps or websites.',
        'Communications: messages you send us, feedback, and safety reports.',
        'Connected services: if you connect a Thrixel account, we store the API key you provide so we can submit generation requests on your behalf.',
      ],
    },
    {
      heading: '2. How we use information',
      body: [
        'To provide the Service: create and secure your account, save and render your rooms, turn photos and scans into 3D models, and show your public content to others when you choose to publish it.',
        'To process payments, manage subscriptions and credits, and prevent fraud.',
        'To send service emails and notifications (for example, “your model is ready”), and — unless you turn them off — product updates about activity on your rooms. Users under 18 only receive service emails.',
        'To keep Toova safe: enforce our Terms, review reports, remove illegal content, and comply with legal obligations, including reporting apparent child sexual abuse material to the National Center for Missing & Exploited Children (NCMEC) as required by U.S. law.',
        'To understand and improve the product, using analytics only if you have consented.',
        'Legal bases (EEA/UK users): performance of our contract with you (providing the Service), our legitimate interests (security, abuse prevention, product improvement that does not rely on cookies), your consent (analytics cookies, notifications), and compliance with legal obligations.',
      ],
    },
    {
      heading: '3. AI processing of your photos and scans',
      body: [
        'When you ask Toova to turn a photo or room scan into 3D furniture or a room layout, the images and related details are sent to the AI service providers listed below for that purpose only. We do not permit these providers to use your content to train their models where their terms give us that choice, and we do not use your photos to identify people.',
      ],
    },
    {
      heading: '4. Who we share information with',
      body: [
        'We do not sell your personal information, and we do not share it for cross-context behavioral advertising.',
        'Service providers who process data on our behalf: Supabase (database, authentication, and file storage); Cloudflare (content delivery for published models); GitHub Pages (website hosting); Render and Amazon Web Services (application servers, 3D model generation, and AI text processing through Amazon Bedrock); OpenAI (image analysis of room scans); Resend (email delivery); Stripe (web payments); Apple (iOS payments, Sign in with Apple, push notifications); Google (Google sign-in and, with consent, Google Analytics); and Meta (Facebook sign-in, if you choose it).',
        'Thrixel: only if you connect your own Thrixel account, we send the reference image and instructions you submit to Thrixel under your account.',
        'Shopping links: when you follow a product link to Amazon, Amazon may know you came from Toova through our affiliate tag. We do not send Amazon your name, email, or account details.',
        'Other people: content you publish (public rooms, gallery models, and public profile name, handle, and photo) is visible to anyone and may be copied to our content delivery network. Share links let anyone with the link view that room.',
        'Legal and safety: we disclose information when required by law, to respond to valid legal process, to protect the safety of any person, or to report apparent child sexual abuse material to NCMEC and law enforcement.',
        'Business transfers: if Toova is involved in a merger, acquisition, or sale of assets, information may be transferred as part of that transaction, subject to this policy.',
      ],
    },
    {
      heading: '5. Cookies and similar technologies',
      body: [
        'We use essential browser storage to keep you signed in, remember your preferences, and save designs you start before creating an account. These are required for the Service to work.',
        'Analytics cookies (Google Analytics) are optional and only load after you click Accept. You can change your choice at any time with the “Cookie settings” link in the site footer or on your profile. If your browser sends a Global Privacy Control signal, we treat it as a rejection of analytics.',
      ],
    },
    {
      heading: '6. How long we keep information',
      body: [
        'Account information and your content are kept while your account is active. When you delete your account, we delete your account record, rooms, uploads, models, published copies, and connected-service keys, and ask Stripe to delete your customer record. Residual copies in backups are overwritten within 30 days.',
        'Raw analytics events are kept for up to 25 months; aggregated statistics that cannot identify you may be kept longer.',
        'Safety reports and related evidence are kept as long as needed to investigate and resolve them, and longer when the law requires us to preserve them (for example, at least 90 days after a report to NCMEC).',
        'Purchase records are kept as long as required for tax and accounting purposes.',
      ],
    },
    {
      heading: '7. Your choices and rights',
      body: [
        'In the app and on the web you can edit your profile, make content private, turn off email categories or unsubscribe from all non-essential email, change your cookie choice, and permanently delete your account (Profile → Delete account).',
        `Depending on where you live (including the EEA, UK, California, and other U.S. states), you may have the right to access, correct, delete, or receive a portable copy of your personal information, to object to or restrict certain processing, and to withdraw consent. Email ${contact} from the address on your account to make a request. We will verify your request and respond within the time the law requires (usually 30 to 45 days). We will not discriminate against you for exercising these rights.`,
        'You may authorize an agent to make a request on your behalf; we may ask the agent for proof of authorization. If we deny your request you may appeal by replying to our response, and EEA/UK residents may also complain to their local data protection authority.',
      ],
    },
    {
      heading: '8. Children and teens',
      body: [
        'Toova is not directed to children, and you must be at least 13 years old to create an account. We ask for your birth month and year before you can use the Service. If someone indicates they are under 13, we do not create an account for them and promptly delete any information already received during sign-up.',
        `If you believe a child under 13 has given us personal information, contact ${contact} and we will delete it.`,
        'For users aged 13 to 17, profiles are private by default and we send only essential service emails. Teens should use Toova with the permission of a parent or guardian.',
      ],
    },
    {
      heading: '9. Security',
      body: [
        'We use encryption in transit, access controls, row-level database security, and short-lived signed links for private files. No system is perfectly secure; if a breach affects your personal information, we will notify you as required by law.',
      ],
    },
    {
      heading: '10. International transfers',
      body: [
        'Toova is operated from the United States and our service providers may process data in the United States and other countries. Where required, we rely on safeguards such as the European Commission’s Standard Contractual Clauses for transfers out of the EEA and UK.',
      ],
    },
    {
      heading: '11. Changes to this policy',
      body: [
        'We will post any changes on this page and update the effective date. If changes are material, we will ask you to review and accept the updated policy the next time you use Toova.',
      ],
    },
    {
      heading: '12. Contact',
      body: [
        `Questions or requests about privacy: ${contact}`,
      ],
    },
  ],
};
