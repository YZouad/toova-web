import { generateGlbThumbnail } from './generateGlbThumbnail';
import { signModelObjectPath, uploadModelThumbnail } from './modelStorage';
import { supabase } from './supabase';

const sessionPreviewCache = new Map<string, string>();
const skippedKinds = new Set<string>();
const HEAL_KEY = 'toova-catalog-thumb-glb-v1';

let queueRunning = false;
const pendingJobs: BackfillJob[] = [];

export interface BackfillJobInput {
  kind: string;
  signedUrl: string;
  ownerUserId: string | null;
  /** Replace an existing (possibly wrong) thumbnail with a fresh GLB snapshot. */
  replace?: boolean;
}

type PreviewCallback = (kind: string, previewUrl: string) => void;

interface BackfillJob extends BackfillJobInput {
  currentUserId: string | null;
  onPreview: PreviewCallback;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function idleWait() {
  return new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 2000 });
    } else {
      window.setTimeout(resolve, 50);
    }
  });
}

/** True until this browser has replaced a photo thumbnail with a GLB snapshot. */
export function catalogThumbNeedsGlbHeal(kind: string): boolean {
  try {
    const done = JSON.parse(localStorage.getItem(HEAL_KEY) || '[]') as string[];
    return !done.includes(kind);
  } catch {
    return true;
  }
}

function markCatalogThumbHealed(kind: string) {
  try {
    const done = new Set(JSON.parse(localStorage.getItem(HEAL_KEY) || '[]') as string[]);
    done.add(kind);
    localStorage.setItem(HEAL_KEY, JSON.stringify([...done]));
  } catch {
    /* ignore */
  }
}

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;

  while (pendingJobs.length > 0) {
    const job = pendingJobs.shift()!;
    try {
      await idleWait();
      const blob = await generateGlbThumbnail(job.signedUrl);
      if (!blob) {
        skippedKinds.add(job.kind);
        if (job.replace) markCatalogThumbHealed(job.kind);
        continue;
      }

      let previewUrl = URL.createObjectURL(blob);
      sessionPreviewCache.set(job.kind, previewUrl);
      job.onPreview(job.kind, previewUrl);
      if (job.replace) markCatalogThumbHealed(job.kind);

      const canPersist =
        job.ownerUserId &&
        job.currentUserId &&
        job.ownerUserId === job.currentUserId;

      if (canPersist) {
        const path = await uploadModelThumbnail(blob, job.currentUserId!);
        if (path) {
          const { error } = await supabase
            .from('furniture_catalog')
            .update({ thumbnail_path: path })
            .eq('kind', job.kind);
          if (!error) {
            const signed = await signModelObjectPath(path);
            if (signed) {
              URL.revokeObjectURL(previewUrl);
              sessionPreviewCache.set(job.kind, signed);
              job.onPreview(job.kind, signed);
            }
          }
        }
      }
    } catch {
      skippedKinds.add(job.kind);
      if (job.replace) markCatalogThumbHealed(job.kind);
    }
    await delay(120);
  }

  queueRunning = false;
}

/** Session-cached preview URL for a kind (blob or signed). */
export function getSessionCatalogPreview(kind: string): string | undefined {
  return sessionPreviewCache.get(kind);
}

/** Queue serial GLB snapshot backfill for catalog rows missing (or replacing) thumbnails. */
export function enqueueCatalogThumbnailBackfill(
  jobs: BackfillJobInput[],
  currentUserId: string | null,
  onPreview: PreviewCallback,
) {
  for (const job of jobs) {
    if (skippedKinds.has(job.kind)) continue;
    if (!job.replace && sessionPreviewCache.has(job.kind)) continue;
    if (pendingJobs.some((p) => p.kind === job.kind)) continue;
    pendingJobs.push({ ...job, currentUserId, onPreview });
  }
  void drainQueue();
}
