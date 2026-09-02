import type { FurnitureKind } from '../../furniture/registry';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import { recordCatalogDownload, shouldRecordCatalogDownload } from '../../lib/catalogEngagement';
import {
  galleryModelImportedSize,
  galleryModelPlacesAsImport,
  isProceduralBuiltinKind,
} from '../../lib/placeGalleryModel';
import { useStore } from '../../store';
import { pushRecentKind } from '../../lib/recentCatalogKinds';

/** Place a gallery/catalog model into the room via existing store addItem patterns. */
export function placeFromCatalog(model: GalleryModel, userId?: string | null): string | null {
  const { addItem } = useStore.getState();
  let id: string | null = null;

  if (isProceduralBuiltinKind(model.kind)) {
    id = addItem(model.kind as FurnitureKind);
  } else if (galleryModelPlacesAsImport(model)) {
    const dims = galleryModelImportedSize(model);
    id = addItem('imported', {
      url: model.signedUrl ?? undefined,
      storagePath: model.storagePath || undefined,
      label: model.label,
      size: dims,
      catalogSizeIn: dims,
      catalogKind: model.kind,
    });
    if (shouldRecordCatalogDownload(model, userId ?? null)) {
      void recordCatalogDownload(model.kind).catch(() => {
        /* best-effort */
      });
    }
  }

  if (id) pushRecentKind(model.kind);
  return id;
}
