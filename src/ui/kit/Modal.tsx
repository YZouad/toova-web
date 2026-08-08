import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Rule } from './Rule';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  meta?: string;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Extra class on the scrim (e.g. stack above product drawer). */
  scrimClassName?: string;
}

export function Modal({
  open,
  title,
  meta,
  onClose,
  children,
  footer,
  width = 560,
  className,
  style,
  scrimClassName,
}: ModalProps) {
  if (!open) return null;

  return createPortal(
    <div
      className={['kit-modal__scrim', scrimClassName].filter(Boolean).join(' ')}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={['kit-modal', className].filter(Boolean).join(' ')}
        style={{ ...style, width: `min(${width}px, 100%)`, maxWidth: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kit-modal-title"
      >
        <div className="kit-modal__header">
          <div>
            {meta ? <div className="kit-modal__meta">{meta}</div> : null}
            <div id="kit-modal-title" className="kit-modal__title">
              {title}
            </div>
          </div>
          <button
            type="button"
            className="kit-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <Rule weight="heavy" className="kit-modal__rule" />
        <div className="kit-modal__body">{children}</div>
        {footer ? <div className="kit-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
