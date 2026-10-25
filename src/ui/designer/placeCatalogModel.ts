import type { FurnitureKind } from '../../furniture/registry';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import { recordCatalogPlaceEngagement } from '../../lib/catalogEngagement';
import { getActiveChecklistRoomId } from '../../lib/dormChecklist';
import { findLocalProductByCatalogKind } from '../../lib/localRoomChecklist';
import {
  galleryModelImportedSize,
  galleryModelPlacesAsImport,
  isProceduralBuiltinKind,
} from '../../lib/placeGalleryModel';
import { resolveBrowsableModelUrl } from '../../lib/modelStorage';
import { useStore } from '../../store';
import { pushRecentKind } from '../../lib/recentCatalogKinds';

export type PlaceFromCatalogOpts = {
  userId?: string | null;
  /** Spawn the item at this plan-space point (area tag suggestions). */
  spawnAt?: [number, number];
};

/** Place a gallery/catalog model into the room via existing store addItem patterns. */
export async function placeFromCatalog(
  model: GalleryModel,
  userIdOrOpts?: string | null | PlaceFromCatalogOpts,
): Promise<string | null> {
  const opts: PlaceFromCatalogOpts =
    userIdOrOpts && typeof userIdOrOpts === 'object'
      ? userIdOrOpts
      : { userId: userIdOrOpts as string | null | undefined };
  const { addItem } = useStore.getState();
  let id: string | null = null;
  const placesAsImport = galleryModelPlacesAsImport(model);
  const spawnAt = opts.spawnAt;

  if (isProceduralBuiltinKind(model.kind)) {
    id = addItem(model.kind as FurnitureKind, spawnAt ? { spawnAt } : undefined);
  } else if (placesAsImport) {
    const dims = galleryModelImportedSize(model);
    const localProduct = findLocalProductByCatalogKind(
      model.kind,
      getActiveChecklistRoomId(),
    );
    let url = model.signedUrl ?? null;
    if (!url && model.storagePath) {
      url = await resolveBrowsableModelUrl(model.storagePath);
    }
    id = addItem('imported', {
      url: url ?? undefined,
      storagePath: model.storagePath || undefined,
      label: model.label,
      size: dims,
      catalogSizeIn: dims,
      catalogKind: model.kind,
      catalogTags: model.tags.length ? [...model.tags] : undefined,
      curatedProductId: localProduct?.id,
      wallMounted: model.tags.includes('poster') ? true : undefined,
      spawnAt,
    });
    recordCatalogPlaceEngagement(model, opts.userId ?? null);
  }

  if (id) pushRecentKind(model.kind);
  return id;
}
