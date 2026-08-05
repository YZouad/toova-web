import type { CSSProperties, ReactNode } from 'react';
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
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="kit-modal__scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={['kit-modal', className].filter(Boolean).join(' ')}
        style={{ ...style, width, maxWidth: '100%' }}
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
    </div>
  );
}
