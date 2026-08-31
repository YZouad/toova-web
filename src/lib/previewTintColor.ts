import { signBrowsableModelPath } from './modelStorage';
import { supabase } from './supabase';

const FALLBACK_IMPORTED = '#7E8A60';

/** Session cache: storage path or model_url → css hex. */
const colorByKey = new Map<string, string>();

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Average opaque pixels from an image URL.
 * Skips near-transparent and near-beige thumbnail background (#E9DFCC).
 */
export async function averageColorFromImageUrl(url: string): Promise<string | null> {
  try {
    const img = await loadImage(url);
    const maxSide = 64;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] ?? 0;
      if (a < 40) continue;
      const pr = data[i] ?? 0;
      const pg = data[i + 1] ?? 0;
      const pb = data[i + 2] ?? 0;
      // Skip palette thumbnail cream background.
      if (isNearBeige(pr, pg, pb)) continue;
      r += pr;
      g += pg;
      b += pb;
      n++;
    }
    if (n < 8) return null;
    return rgbToHex(r / n, g / n, b / n);
  } catch {
    return null;
  }
}

function isNearBeige(r: number, g: number, b: number): boolean {
  // PREVIEW_BG ≈ #E9DFCC
  return Math.abs(r - 0xe9) < 28 && Math.abs(g - 0xdf) < 28 && Math.abs(b - 0xcc) < 28;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

export interface PreviewTintResolved {
  modelUrl: string;
  tint: string;
}

/**
 * Resolve plan-rect tint colors for imported models from catalog thumbnails.
 * Returns model_url → hex. Missing thumbs fall back to the imported green.
 *
 * Uses signed Supabase storage URLs (not the R2 CDN) so canvas sampling works
 * from localhost — assets.toova.net does not send CORS for Vite origin.
 */
export async function resolvePreviewTintsForModelUrls(
  modelUrls: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(modelUrls.map((u) => u.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  for (const url of unique) {
    const cached = colorByKey.get(url);
    if (cached) out.set(url, cached);
  }
  const missing = unique.filter((u) => !out.has(u));
  if (missing.length === 0) return out;

  const { data: catalogRows, error } = await supabase
    .from('furniture_catalog')
    .select('model_url,thumbnail_path,visibility')
    .in('model_url', missing);
  if (error || !catalogRows?.length) {
    for (const u of missing) {
      out.set(u, FALLBACK_IMPORTED);
      colorByKey.set(u, FALLBACK_IMPORTED);
    }
    return out;
  }

  await Promise.all(
    catalogRows.map(async (row) => {
      const modelUrl = String(row.model_url ?? '').trim();
      if (!modelUrl) return;
      const thumbPath = String(row.thumbnail_path ?? '').trim();
      let tint = FALLBACK_IMPORTED;
      if (thumbPath) {
        const pathCached = colorByKey.get(thumbPath);
        if (pathCached) {
          tint = pathCached;
        } else {
          // Signed private-bucket URL is CORS-friendly; public CDN is not on localhost.
          const signed = await signBrowsableModelPath(thumbPath);
          if (signed) {
            const avg = await averageColorFromImageUrl(signed);
            if (avg) {
              tint = avg;
              colorByKey.set(thumbPath, avg);
            }
          }
        }
      }
      colorByKey.set(modelUrl, tint);
      out.set(modelUrl, tint);
    }),
  );

  for (const u of missing) {
    if (!out.has(u)) {
      out.set(u, FALLBACK_IMPORTED);
      colorByKey.set(u, FALLBACK_IMPORTED);
    }
  }
  return out;
}

export { FALLBACK_IMPORTED };
