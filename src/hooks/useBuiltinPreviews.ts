import { useEffect, useState } from 'react';
import {
  BUILTIN_KINDS,
  generateBuiltinThumbnail,
} from '../lib/generateBuiltinThumbnail';
import type { FurnitureKind } from '../furniture/registry';

const sessionCache = new Map<string, string>();

/** Lazy procedural JPEG previews for builtin furniture palette tiles. */
export function useBuiltinPreviews() {
  const [previews, setPreviews] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const kind of BUILTIN_KINDS) {
      const cached = sessionCache.get(kind);
      if (cached) initial[kind] = cached;
    }
    return initial;
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      for (const kind of BUILTIN_KINDS) {
        if (cancelled || sessionCache.has(kind)) continue;
        const blob = await generateBuiltinThumbnail(kind);
        if (cancelled || !blob) continue;
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
