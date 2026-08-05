import type { CSSProperties, MouseEvent } from 'react';
import { DisplayHeading, type DisplayLevel } from './DisplayHeading';
import { MonoMeta } from './MonoMeta';

export interface SectionOpenerProps {
  title: React.ReactNode;
  note?: string;
  noteHref?: string;
  noteOnClick?: () => void;
  level?: DisplayLevel;
  id?: string;
  inverse?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function SectionOpener({
  title,
  note,
  noteHref,
  noteOnClick,
  level = 4,
  id,
  inverse = false,
  className,
  style,
}: SectionOpenerProps) {
  const noteInteractive = Boolean(noteHref || noteOnClick);
  const NoteTag = noteHref ? 'a' : noteOnClick ? 'button' : 'span';

  return (
    <div id={id} className={className} style={style}>
      <div
        className={[
          'kit-section-opener',
          inverse ? 'kit-section-opener--inverse' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <DisplayHeading level={level} inverse={inverse}>
          {title}
        </DisplayHeading>
        {note ? (
          <NoteTag
            className={[
              'kit-section-opener__note',
              noteInteractive ? 'kit-section-opener__note--interactive' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            href={noteHref}
            onClick={
              noteOnClick
                ? (e: MouseEvent) => {
                    e.preventDefault();
                    noteOnClick();
                  }
                : undefined
            }
            type={noteOnClick && !noteHref ? 'button' : undefined}
          >
            {note}
          </NoteTag>
        ) : null}
      </div>
    </div>
  );
}
