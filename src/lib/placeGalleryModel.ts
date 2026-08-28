import { FURNITURE } from '../furniture/registry';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import type { InchSize } from './importedItemSize';

export function isProceduralBuiltinKind(kind: string): boolean {
  return kind in FURNITURE && kind !== 'imported' && kind !== 'hanging' && kind !== 'light';
}

export function galleryModelImportedSize(model: GalleryModel): InchSize {
  return [model.width_in, model.height_in, model.depth_in];
}

/** True when a Toova-bank / gallery card should place as an imported GLB. */
export function galleryModelPlacesAsImport(model: Pick<GalleryModel, 'kind' | 'signedUrl' | 'storagePath'>): boolean {
  if (isProceduralBuiltinKind(model.kind)) return false;
  return Boolean(model.signedUrl || model.storagePath);
}
