import { useEffect, useState } from 'react';

const FALLBACK_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  bookshelf: '#A67C52',
  shelf: '#B08968',
  wardrobe: '#A88457',
  desk: '#B5946C',
  chair: '#CBB28F',
  nightstand: '#C0A47A',
  lamp: '#D4C4A0',
  imported: '#7E8A60',
  hanging: '#E8C27A',
  light: '#F0DCA8',
};

export function pieceFallbackColor(kind: string, tintColor?: string): string {
  return tintColor ?? FALLBACK_COLORS[kind] ?? '#C9B391';
}

export function PieceThumb({
  kind,
  tintColor,
  previewUrl,
  className,
}: {
  kind: string;
  tintColor?: string;
  previewUrl?: string | null;
  className: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [previewUrl]);

  const showImg = !!previewUrl && !broken;
  const fallback = pieceFallbackColor(kind, tintColor);

  return (
    <span
      className={className}
      style={{ background: fallback }}
      aria-hidden
    >
      {showImg ? (
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : null}
    </span>
  );
}
