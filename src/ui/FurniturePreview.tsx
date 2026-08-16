import type { CSSProperties } from 'react';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';

interface FurniturePreviewProps {
  kind: string;
  /** Inch dimensions [w, h, d]. Shown as a proportion hint for imported models. */
  size?: [number, number, number];
  /** Signed thumbnail or session snapshot URL for community/imported models. */
  previewUrl?: string | null;
  className?: string;
  style?: CSSProperties;
}

const SWATCH_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  wardrobe: '#A88457',
  desk: '#B5946C',
  chair: '#CBB28F',
  nightstand: '#C0A47A',
  lamp: '#D4C4A0',
  imported: '#7E8A60',
};

const KIND_GLYPH: Record<string, string> = {
  bed: '▭',
  dresser: '▣',
  wardrobe: '▥',
  desk: '▬',
  chair: '◫',
  nightstand: '▪',
  lamp: '◔',
  imported: '◆',
};

function labelForKind(kind: string): string {
  if (kind === 'hanging') return 'Hanging decor';
  if (kind === 'light') return 'Light';
  if (kind !== 'imported' && kind in FURNITURE) {
    return FURNITURE[kind as Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>].label;
  }
  return kind === 'imported' ? 'Model' : kind;
}

/**
 * Palette thumbnail: JPEG preview when available, else CSS swatch (no WebGL per tile).
 */
export function FurniturePreview({
  kind,
  previewUrl,
  className,
  style,
}: FurniturePreviewProps) {
  const color = SWATCH_COLORS[kind] ?? '#CBB28F';
  const glyph = KIND_GLYPH[kind] ?? '▢';
  const label = labelForKind(kind);
  const classes = ['furniture-preview', className].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style} title={label} aria-hidden>
      {previewUrl ? (
        <img className="furniture-preview-img" src={previewUrl} alt="" draggable={false} />
      ) : (
        <div
          className="furniture-preview-swatch"
          style={{
            background: `linear-gradient(145deg, ${color} 0%, color-mix(in srgb, ${color} 68%, #2a2018) 100%)`,
          }}
        >
          {glyph}
        </div>
      )}
    </div>
  );
}
