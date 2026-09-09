import { useEffect, useState } from 'react';
import { createGlbObjectUrl, revokeGlbObjectUrl } from '../lib/glbObjectUrl';

/** Stable blob URL for a local GLB file; revoked on change/unmount. */
export function useGlbPreviewUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = createGlbObjectUrl(file);
    setUrl(next);
    return () => revokeGlbObjectUrl(next);
  }, [file]);

  return url;
}
