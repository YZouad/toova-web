import type { ReactNode } from 'react';
import { SectionOpener } from './kit';

interface GalleryShelfProps {
  title: string;
  note?: string;
  seeAllHref?: string | null;
  onSeeAll?: () => void;
  children: ReactNode;
  empty?: boolean;
}

export function GalleryShelf({
  title,
  note,
  seeAllHref,
  onSeeAll,
  children,
  empty,
}: GalleryShelfProps) {
  if (empty) return null;

  return (
    <section style={{ marginTop: 56 }}>
      <SectionOpener
        level={5}
        title={`${title}.`}
        note={note ?? (onSeeAll || seeAllHref ? 'See all →' : undefined)}
        noteOnClick={
          onSeeAll
            ? onSeeAll
            : seeAllHref
              ? () => window.location.assign(seeAllHref)
              : undefined
        }
      />
      <div style={{ paddingTop: 28 }}>{children}</div>
    </section>
  );
}
