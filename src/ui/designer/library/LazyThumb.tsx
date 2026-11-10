import { useEffect, useRef, useState } from 'react';
import {
  getBuiltinPreviewUrl,
  requestBuiltinPreview,
  useBuiltinPreviews,
} from '../../../hooks/useBuiltinPreviews';

export interface LazyThumbProps {
  kind: string;
  label: string;
  previewUrl?: string | null;
  isBuiltin?: boolean;
  /**
   * Pixel / CSS size. Pass `undefined` (or omit with `fill`) to let CSS size the thumb —
   * needed for rail cards where an inline size would override aspect-ratio rules.
   */
  size?: number | string;
  /** Fill the parent; no inline width/height. */
  fill?: boolean;
  className?: string;
}

export function LazyThumb({
  kind,
  label,
  previewUrl,
  isBuiltin,
  size = 36,
  fill = false,
  className,
}: LazyThumbProps) {
  const builtinPreviews = useBuiltinPreviews();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [previewUrl, kind]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (visible && isBuiltin) requestBuiltinPreview(kind);
  }, [visible, isBuiltin, kind]);

  const thumb =
    previewUrl ??
    (isBuiltin ? getBuiltinPreviewUrl(kind, builtinPreviews) : undefined);
  const letter = (label?.trim()?.[0] ?? '?').toUpperCase();
  const dim = fill ? undefined : typeof size === 'number' ? `${size}px` : size;
  const showImg = visible && !!thumb && !failed;

  return (
    <span
      ref={ref}
      className={`dgl-thumb${fill ? ' dgl-thumb--fill' : ''}${className ? ` ${className}` : ''}`}
      style={dim ? { width: dim, height: dim } : undefined}
      aria-hidden
    >
      {showImg ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            setFailed(true);
            if (isBuiltin) requestBuiltinPreview(kind);
          }}
        />
      ) : (
        <span className="dgl-thumb__letter">{letter}</span>
      )}
    </span>
  );
}
