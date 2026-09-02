import { useEffect, useState } from 'react';
import {
  BUILTIN_KINDS,
  generateBuiltinThumbnail,
  generateRugThumbnail,
} from '../lib/generateBuiltinThumbnail';
import type { FurnitureKind } from '../furniture/registry';

const sessionCache = new Map<string, string>();
const RUG_KIND = 'checklist-rug';
const listeners = new Set<(previews: Record<string, string>) => void>();

type ProceduralKind = Exclude<FurnitureKind, 'imported' | 'hanging' | 'light'>;

function snapshotPreviews(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [kind, url] of sessionCache) out[kind] = url;
  return out;
}

function notifyPreviewListeners() {
  const snap = snapshotPreviews();
  for (const listener of listeners) listener(snap);
}

function isProceduralKind(kind: string): kind is ProceduralKind | typeof RUG_KIND {
  return kind === RUG_KIND || (BUILTIN_KINDS as string[]).includes(kind);
}

async function renderKind(kind: string): Promise<Blob | null> {
  if (kind === RUG_KIND) return generateRugThumbnail();
  if ((BUILTIN_KINDS as string[]).includes(kind)) {
    return generateBuiltinThumbnail(kind as ProceduralKind);
  }
  return null;
}

const pending: string[] = [];
let pumping = false;

async function pumpBuiltinPreviews() {
  if (pumping) return;
  pumping = true;
  try {
    while (pending.length > 0) {
      const kind = pending.shift()!;
      if (sessionCache.has(kind)) continue;
      const blob = await renderKind(kind);
      if (!blob) continue;
      sessionCache.set(kind, URL.createObjectURL(blob));
      notifyPreviewListeners();
    }
  } finally {
    pumping = false;
    if (pending.length > 0) void pumpBuiltinPreviews();
  }
}

/** Queue a procedural JPEG; requested kinds render before the background sweep. */
export function requestBuiltinPreview(kind: string) {
  if (!isProceduralKind(kind) || sessionCache.has(kind)) return;
  const queued = pending.indexOf(kind);
  if (queued >= 0) pending.splice(queued, 1);
  pending.unshift(kind);
  void pumpBuiltinPreviews();
}

/** Lazy procedural JPEG previews for builtin furniture palette tiles. */
export function useBuiltinPreviews() {
  const [previews, setPreviews] = useState<Record<string, string>>(snapshotPreviews);

  useEffect(() => {
    listeners.add(setPreviews);
    setPreviews(snapshotPreviews());
    for (const kind of BUILTIN_KINDS) requestBuiltinPreview(kind);
    requestBuiltinPreview(RUG_KIND);
    return () => {
      listeners.delete(setPreviews);
    };
  }, []);

  return previews;
}

export function getBuiltinPreviewUrl(
  kind: string,
  previews: Record<string, string> = {},
): string | undefined {
  if (kind === 'imported') return undefined;
  return previews[kind] ?? sessionCache.get(kind);
}

export function withBuiltinPreview<
  T extends { kind: string; isBuiltin?: boolean; previewUrl?: string | null },
>(model: T, previews: Record<string, string> = {}): T {
  if (model.previewUrl || !model.isBuiltin) return model;
  const url = getBuiltinPreviewUrl(model.kind, previews);
  return url ? { ...model, previewUrl: url } : model;
}

export type { FurnitureKind };
