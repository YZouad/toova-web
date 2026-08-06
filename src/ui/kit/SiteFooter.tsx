import { Footer, type FooterLink } from './Footer';

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
    { label: 'Privacy' },
    { label: 'Terms' },
    ...(onAdmin ? [{ label: 'Admin', onClick: onAdmin }] : []),
  ];

  return <Footer className={className} links={links} />;
}
