import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

interface PanelShellProps {
  compact?: boolean;
  sheetClass?: string;
  mobileHeight?: 'tall' | 'mid' | 'short';
  eyebrow?: string;
  title: string;
  onClose: () => void;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useTrapFocus(
  rootRef: RefObject<HTMLElement | null>,
  closeRef: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    closeRef.current?.focus();
    const root = rootRef.current;
    if (!root) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [closeRef, rootRef]);
}

/** Shared desktop sheet / mobile bottom-sheet chrome for designer panels. */
export function PanelShell({
  compact,
  sheetClass = 'dg-sheet--side',
  mobileHeight = 'mid',
  eyebrow,
  title,
  onClose,
  headerExtra,
  footer,
  children,
  bodyClassName,
}: PanelShellProps) {
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useTrapFocus(rootRef, closeRef);

  // Desktop: click outside the sheet closes it. Keep rail/dock clicks so users
  // can switch panels without the dismiss wiping the new selection.
  useEffect(() => {
    if (compact) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (rootRef.current?.contains(t)) return;
      if (
        t.closest(
          '.dg-rail, .dg-dock, .dg-more-menu, .dg-cmdk, .dg-keys, .dg-import, .dg-ticker, .dg-topbar',
        )
      ) {
        return;
      }
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [compact, onClose]);

  if (compact) {
    return (
      <>
        <button type="button" className="dg-scrim" aria-label="Close panel" onClick={onClose} />
        <aside
          ref={rootRef}
          className={`dg-mobile-sheet dg-mobile-sheet--${mobileHeight}`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="dg-mobile-sheet__handle" aria-hidden />
          <div className="dg-mobile-sheet__header">
            <div style={{ flex: 1, minWidth: 0 }}>
              {eyebrow ? <div className="dg-sheet-header__eyebrow">{eyebrow}</div> : null}
              <div className="dg-sheet-header__title">{title}</div>
            </div>
            {headerExtra}
            <button
              ref={closeRef}
              type="button"
              className="dg-sheet-header__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className={`dg-mobile-sheet__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>
            {children}
          </div>
          {footer ? <div className="dg-sheet-footer">{footer}</div> : null}
        </aside>
      </>
    );
  }

  return (
    <aside
      ref={rootRef}
      className={`dg-sheet ${sheetClass}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="dg-sheet-header">
        <div className="dg-sheet-header__copy">
          {eyebrow ? <div className="dg-sheet-header__eyebrow">{eyebrow}</div> : null}
          <div className="dg-sheet-header__title">{title}</div>
        </div>
        {headerExtra}
        <button
          ref={closeRef}
          type="button"
          className="dg-sheet-header__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className={`dg-sheet-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
      {footer ? <div className="dg-sheet-footer">{footer}</div> : null}
    </aside>
  );
}

interface SectionProps {
  title: string;
  meta?: string;
  children: ReactNode;
}

export function PanelSection({ title, meta, children }: SectionProps) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
      <div className="dg-row dg-row--between" style={{ padding: 0, minHeight: 0 }}>
        <span style={{ font: '600 13px/1 var(--font-sans)', color: 'var(--ink-1)' }}>{title}</span>
        {meta ? <span className="dg-row__meta">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}
