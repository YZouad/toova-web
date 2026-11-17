import { createGlbObjectUrl } from './glbObjectUrl';
import {
  inchDimensionsFromBounds,
  readGlbAxisBoundsWithTimeout,
} from './glbImportPipeline';
import { DEFAULT_IMPORTED_MAX_SIDE } from './importedItemSize';
import { useStore } from '../store';
import type { GenerationQueueItem } from './generationQueue';

export type GenerationQueuePlacementContext = {
  roomId: string | null;
};

let placementContext: GenerationQueuePlacementContext | null = null;

export function registerGenerationQueuePlacement(ctx: GenerationQueuePlacementContext | null): void {
  placementContext = ctx;
}

export function getGenerationQueuePlacement(): GenerationQueuePlacementContext | null {
  return placementContext;
}

export function canPlaceGenerationInRoom(item: GenerationQueueItem): boolean {
  const ctx = getGenerationQueuePlacement();
  if (!ctx?.roomId || !item.originRoomId || !item.glbFile) return false;
  return item.status === 'ready' && ctx.roomId === item.originRoomId;
}

export async function placeQueuedGlbInRoom(file: File, label: string): Promise<string | null> {
  const bounds = await readGlbAxisBoundsWithTimeout(file);
  const size = bounds
    ? inchDimensionsFromBounds(bounds)
    : ([DEFAULT_IMPORTED_MAX_SIDE, DEFAULT_IMPORTED_MAX_SIDE, DEFAULT_IMPORTED_MAX_SIDE] as [
        number,
        number,
        number,
      ]);
  const url = createGlbObjectUrl(file);
  const title = label.split(/[/\\]/).pop() || label || 'Generated model';
  return useStore.getState().addItem('imported', {
    url,
    label: title,
    size,
    catalogSizeIn: size,
  });
}