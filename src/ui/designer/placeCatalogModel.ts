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

/** Place a gallery/catalog model into the room via existing store addItem patterns. */
export async function placeFromCatalog(model: GalleryModel, userId?: string | null): Promise<string | null> {
  const { addItem } = useStore.getState();
  let id: string | null = null;
  const placesAsImport = galleryModelPlacesAsImport(model);

  if (isProceduralBuiltinKind(model.kind)) {
    id = addItem(model.kind as FurnitureKind);
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
      curatedProductId: localProduct?.id,
    });
    recordCatalogPlaceEngagement(model, userId ?? null);
  }

  if (id) pushRecentKind(model.kind);
  return id;
}
