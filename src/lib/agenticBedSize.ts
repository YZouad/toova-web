/** Standard mattress footprints in inches: [width, bodyHeight, length]. */

export type BedFootprint = {
  widthIn: number;
  lengthIn: number;
};

const BED_SIZES: Array<{ re: RegExp; widthIn: number; lengthIn: number }> = [
  { re: /\btwin[\s-]?xl\b/i, widthIn: 38, lengthIn: 80 },
  { re: /\bking\b/i, widthIn: 76, lengthIn: 80 },
  { re: /\bqueen\b/i, widthIn: 60, lengthIn: 80 },
  { re: /\bfull\b|\bdouble\b/i, widthIn: 54, lengthIn: 75 },
  { re: /\btwin\b/i, widthIn: 38, lengthIn: 75 },
];

const DEFAULT_BED: BedFootprint = { widthIn: 38, lengthIn: 75 };

export function resolveBedFootprint(query: string): BedFootprint {
  for (const spec of BED_SIZES) {
    if (spec.re.test(query)) {
      return { widthIn: spec.widthIn, lengthIn: spec.lengthIn };
    }
  }
  return DEFAULT_BED;
}

export function isBedFrameQuery(query: string): boolean {
  const n = query.toLowerCase();
  if (/\b(bedding|comforter|sheets|duvet|pillow|mattress pad)\b/.test(n)) return false;
  return /\b(bed|mattress)\b/.test(n);
}

export function bedFrameSpecificity(query: string): number {
  let score = 0;
  if (/\bbed\s+frame\b/i.test(query)) score += 3;
  if (/\bmattress\b/i.test(query)) score += 2;
  if (/\bbed\b/i.test(query)) score += 1;
  for (const spec of BED_SIZES) {
    if (spec.re.test(query)) score += 2;
  }
  return score;
}
