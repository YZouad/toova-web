/** Create an object URL for in-memory GLB preview. Caller must revoke when done. */
export function createGlbObjectUrl(file: File | Blob): string {
  return URL.createObjectURL(file);
}

export function revokeGlbObjectUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}
