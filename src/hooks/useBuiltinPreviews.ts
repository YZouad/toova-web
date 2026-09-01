import { useEffect, useState } from 'react';
import {
  BUILTIN_KINDS,
  generateBuiltinThumbnail,
  generateRugThumbnail,
} from '../lib/generateBuiltinThumbnail';
import type { FurnitureKind } from '../furniture/registry';

const sessionCache = new Map<string, string>();
const RUG_KIND = 'checklist-rug';

/** Lazy procedural JPEG previews for builtin furniture palette tiles. */
export function useBuiltinPreviews() {
  const [previews, setPreviews] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const kind of BUILTIN_KINDS) {
      const cached = sessionCache.get(kind);
      if (cached) initial[kind] = cached;
    }
    const rugCached = sessionCache.get(RUG_KIND);
    if (rugCached) initial[RUG_KIND] = rugCached;
    return initial;
  });

  useEffect(() => {
    let cancelled = false;

    async function generateAndCache(kind: string, generate: () => Promise<Blob | null>) {
      if (cancelled || sessionCache.has(kind)) return;
      const blob = await generate();
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      sessionCache.set(kind, url);
      setPreviews((prev) => ({ ...prev, [kind]: url }));
      await new Promise<void>((resolve) => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => resolve(), { timeout: 500 });
        } else {
          window.setTimeout(resolve, 80);
        }
      });
    }

    async function run() {
      for (const kind of BUILTIN_KINDS) {
        await generateAndCache(kind, () => generateBuiltinThumbnail(kind));
      }
      await generateAndCache(RUG_KIND, generateRugThumbnail);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return previews;
}

export function getBuiltinPreviewUrl(
  kind: string,
  previews: Record<string, string>,
): string | undefined {
  if (kind === 'imported') return undefined;
  return previews[kind] ?? sessionCache.get(kind);
}

export type { FurnitureKind };
