import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { MOBILE_SHEET_TOP, type MobileSheetKind } from './mobileTypes';

interface MobileSheetProps {
  kind: Exclude<MobileSheetKind, null>;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra class for sheet body. */
  bodyClassName?: string;
  /** Optional header trailing actions. */
  headerEnd?: ReactNode;
  /** When true, hide the default title (custom header inside). */
  hideTitle?: boolean;
}

/**
 * Accessible bottom sheet with handle-drag + velocity snap.
 * Snaps open (reference top offset) or closed (dismiss).
 */
export function MobileSheet({
  kind,
  title,
  onClose,
  children,
  bodyClassName = '',
  headerEnd,
  hideTitle = false,
}: MobileSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startTranslate = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const [translateY, setTranslateY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const topInset = MOBILE_SHEET_TOP[kind];
  const hugContent = topInset === 'auto';

  const dismiss = useCallback(() => {
    if (reducedMotion) {
      onClose();
      return;
    }
    setTranslateY(window.innerHeight);
    window.setTimeout(onClose, 220);
  }, [onClose, reducedMotion]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = sheetRef.current;
    const focusable = root?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => {
      prev?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  const onHandlePointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startTranslate.current = translateY;
    lastY.current = e.clientY;
    lastT.current = performance.now();
    velocity.current = 0;
    setDragging(true);
  };

  const onHandlePointerMove = (e: ReactPointerEvent) => {
    if (!dragging && !(e.buttons & 1)) return;
    const dy = Math.max(0, e.clientY - startY.current);
    const now = performance.now();
    const dt = Math.max(1, now - lastT.current);
    velocity.current = ((e.clientY - lastY.current) / dt) * 1000;
    lastY.current = e.clientY;
    lastT.current = now;
    setTranslateY(startTranslate.current + dy);
  };

  const onHandlePointerUp = () => {
    setDragging(false);
    const shouldClose = translateY > 120 || velocity.current > 800;
    if (shouldClose) {
      dismiss();
    } else {
      setTranslateY(0);
    }
  };

  return (
    <>
      <button
        type="button"
        className="dgm-scrim"
        aria-label="Dismiss"
        onClick={dismiss}
      />
      <div
        ref={sheetRef}
        className={`dgm-sheet dgm-sheet--${kind}${hugContent ? ' is-hug' : ''}${dragging ? ' is-dragging' : ''}`}
        style={{
          ...(hugContent ? {} : { top: topInset }),
          transform: `translate3d(0, ${translateY}px, 0)`,
          transition: dragging || reducedMotion ? 'none' : undefined,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideTitle ? undefined : titleId}
      >
        <div
          className="dgm-sheet-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className="dgm-sheet-handle-pill" aria-hidden />
        </div>
        {!hideTitle ? (
          <div className="dgm-sheet-head">
            <h2 id={titleId} className="dgm-sheet-title">
              {title}
            </h2>
            <div className="dgm-sheet-head-end">
              {headerEnd}
              <button type="button" className="dgm-icon-btn" aria-label="Close" onClick={dismiss}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}
        <div className={`dgm-sheet-body ${bodyClassName}`.trim()}>{children}</div>
      </div>
    </>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
