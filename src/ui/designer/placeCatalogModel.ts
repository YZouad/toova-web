import type { FurnitureKind } from '../../furniture/registry';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import { defaultWallPosterPose } from '../../interaction/collision';
import { recordCatalogPlaceEngagement } from '../../lib/catalogEngagement';
import { getActiveChecklistRoomId } from '../../lib/dormChecklist';
import { findLocalProductByCatalogKind } from '../../lib/localRoomChecklist';
import {
  galleryModelImportedSize,
  galleryModelPlacesAsImport,
  isProceduralBuiltinKind,
} from '../../lib/placeGalleryModel';
import { isPosterItem } from '../../lib/posterItem';
import { resolvePosterOptionUrls, type PosterBankOption } from '../../lib/posterBank';
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
      catalogTags: model.tags.length ? [...model.tags] : undefined,
      curatedProductId: localProduct?.id,
      wallMounted: model.tags.includes('poster') ? true : undefined,
    });
    recordCatalogPlaceEngagement(model, userId ?? null);
  }

  if (id) pushRecentKind(model.kind);
  return id;
}

/** Hang a poster-bank print on the longest wall and select it. */
export async function placePosterOption(option: PosterBankOption): Promise<string | null> {
  const resolved = await resolvePosterOptionUrls(option);
  if (!resolved.signedUrl) return null;

  const size: [number, number, number] = [
    resolved.widthIn,
    resolved.heightIn,
    resolved.depthIn > 0 ? resolved.depthIn : 0.5,
  ];
  const state = useStore.getState();
  const slot = state.order.filter((id) => isPosterItem(state.items[id])).length;
  const pose = defaultWallPosterPose(state.roomGeometry, size, slot);
  const tags = resolved.tags.includes('poster') ? [...resolved.tags] : [...resolved.tags, 'poster'];

  return state.addItem('imported', {
    url: resolved.signedUrl,
    storagePath: resolved.modelPath,
    label: resolved.label,
    size,
    catalogSizeIn: size,
    catalogKind: resolved.kind,
    catalogTags: tags,
    wallMounted: true,
    pose,
  });
}
