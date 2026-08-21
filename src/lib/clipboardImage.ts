const IMAGE_MIME = /^image\//;

function extensionForMime(type: string): string {
  const subtype = type.split('/')[1]?.split('+')[0] ?? 'png';
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'svg+xml') return 'svg';
  return subtype.replace(/[^a-z0-9]/gi, '') || 'png';
}

export function pasteShortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+V';
  const ua = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  const apple = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS|iPhone|iPad/i.test(ua);
  return apple ? '⌘V' : 'Ctrl+V';
}

export function imageFileFromBlob(blob: Blob, fallbackName?: string): File | null {
  const type = blob.type || 'image/png';
  if (!IMAGE_MIME.test(type)) return null;
  if (blob instanceof File && blob.name) return blob;
  const name = fallbackName ?? `clipboard.${extensionForMime(type)}`;
  return new File([blob], name, { type, lastModified: Date.now() });
}

export function imageFileFromClipboardData(data: DataTransfer | null | undefined): File | null {
  if (!data) return null;

  for (const file of Array.from(data.files)) {
    const asImage = imageFileFromBlob(file);
    if (asImage) return asImage;
  }

  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !IMAGE_MIME.test(item.type)) continue;
    const file = item.getAsFile();
    if (!file) continue;
    const asImage = imageFileFromBlob(file);
    if (asImage) return asImage;
  }

  return null;
}

export function imageFileFromClipboardEvent(event: ClipboardEvent): File | null {
  return imageFileFromClipboardData(event.clipboardData);
}

export async function readImageFileFromClipboard(): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((candidate) => IMAGE_MIME.test(candidate));
    if (!type) continue;
    const blob = await item.getType(type);
    const asImage = imageFileFromBlob(blob);
    if (asImage) return asImage;
  }
  return null;
}
