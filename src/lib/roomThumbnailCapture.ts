import { useStore, type Item } from '../store';
import { resolvePreviewTintsForModelUrls } from './previewTintColor';
import { renderRoomPreviewJpeg } from './roomPreviewThumbnail';
import { uploadRoomThumbnail } from './roomThumbnailStorage';

/** Render the current layout as a plan thumbnail and attach it to the room. */
export async function captureAndUploadRoomThumbnail(userId: string, roomId: string): Promise<void> {
  const { items, order, roomGeometry } = useStore.getState();
  const floorItems = order
    .map((id) => items[id])
    .filter((it): it is Item => Boolean(it) && it.kind !== 'hanging' && it.kind !== 'light');

  const modelUrls = [
    ...new Set(
      floorItems
        .filter((it) => it.kind === 'imported' && it.importedStoragePath)
        .map((it) => it.importedStoragePath!),
    ),
  ];
  const tints =
    modelUrls.length > 0
      ? await resolvePreviewTintsForModelUrls(modelUrls)
      : new Map<string, string>();

  const previewItems = floorItems.map((it) => ({
    id: it.id,
    kind: it.kind,
    position: [...it.position] as [number, number, number],
    rotationY: it.rotationY,
    size: [...it.size] as [number, number, number],
    tint:
      it.kind === 'imported' && it.importedStoragePath
        ? tints.get(it.importedStoragePath) ?? null
        : null,
  }));
  const blob = await renderRoomPreviewJpeg(roomGeometry, previewItems);
  if (blob) {
    await uploadRoomThumbnail(blob, userId, roomId);
  }
}
