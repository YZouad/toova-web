import type { CSSProperties } from 'react';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';

interface FurniturePreviewProps {
  kind: string;
  /** Inch dimensions [w, h, d]. Shown as a proportion hint for imported models. */
  size?: [number, number, number];
  /** Unused — palette previews are CSS-only to avoid exhausting WebGL contexts. */
  url?: string;
  className?: string;
  style?: CSSProperties;
}

const PREVIEW_BG = '#E9DFCC';

const SWATCH_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  wardrobe: '#A88457',
  desk: '#B5946C',
  chair: '#CBB28F',
  nightstand: '#C0A47A',
  imported: '#7E8A60',
};

const KIND_GLYPH: Record<string, string> = {
  bed: '▭',
  dresser: '▣',
  wardrobe: '▥',
  desk: '▬',
  chair: '◫',
  nightstand: '▪',
  imported: '◆',
};

function labelForKind(kind: string): string {
  if (kind !== 'imported' && kind in FURNITURE) {
    return FURNITURE[kind as Exclude<FurnitureKind, 'imported'>].label;
  }
  return kind === 'imported' ? 'Model' : kind;
}

/**
 * CSS-only palette thumbnail. Intentionally avoids WebGL so the designer scene
 * keeps its single context when the furniture palette is open.
 */
export function FurniturePreview({ kind, className, style }: FurniturePreviewProps) {
  const color = SWATCH_COLORS[kind] ?? '#CBB28F';
  const glyph = KIND_GLYPH[kind] ?? '▢';
  const label = labelForKind(kind);

  return (
    <div
      className={className}
      style={{
        overflow: 'hidden',
        background: PREVIEW_BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      title={label}
      aria-hidden
    >
      <div
        className="furniture-preview-swatch"
        style={{
          width: '72%',
          height: '72%',
          borderRadius: 10,
          background: `linear-gradient(145deg, ${color} 0%, color-mix(in srgb, ${color} 68%, #2a2018) 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'clamp(18px, 28%, 32px)',
          color: 'color-mix(in srgb, #fff 55%, #2a2018)',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, #fff 25%, transparent)',
        }}
      >
        {glyph}
      </div>
    </div>
  );
}
