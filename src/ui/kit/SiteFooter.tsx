import { Footer, type FooterLink } from './Footer';
import { privacyPath, safetyPath, termsPath } from '../../hooks/useRoute';

export interface SiteFooterProps {
  onContact?: () => void;
  onPitchMadness?: () => void;
  onFeedback?: () => void;
  onAdmin?: () => void;
  className?: string;
}

/** Standard marketing/product footer for content pages (not admin or designer). */
export function SiteFooter({
  onContact,
  onPitchMadness,
  onFeedback,
  onAdmin,
  className,
}: SiteFooterProps) {
  const links: FooterLink[] = [
    { label: 'Contact', onClick: onContact },
    ...(onPitchMadness
      ? [{ label: 'Pitch Madness', onClick: onPitchMadness }]
      : []),
    ...(onFeedback ? [{ label: 'Feedback', onClick: onFeedback }] : []),
    { label: 'Privacy', href: privacyPath() },
    { label: 'Terms', href: termsPath() },
    { label: 'Child Safety', href: safetyPath() },
    ...(onAdmin ? [{ label: 'Admin', onClick: onAdmin }] : []),
  ];

  return <Footer className={className} links={links} />;
}
