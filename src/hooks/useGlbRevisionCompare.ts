import { useCallback, useEffect, useRef, useState } from 'react';
import { createGlbObjectUrl, revokeGlbObjectUrl } from '../lib/glbObjectUrl';

/** Manages before/after blob URLs for revision compare views. */
export function useGlbRevisionCompare() {
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const beforeRef = useRef<string | null>(null);
  const afterRef = useRef<string | null>(null);

  const snapshotBefore = useCallback((file: File | Blob) => {
    revokeGlbObjectUrl(beforeRef.current);
    const url = createGlbObjectUrl(file);
    beforeRef.current = url;
    setBeforeUrl(url);
  }, []);

  const snapshotBeforeFromUrl = useCallback((url: string) => {
    revokeGlbObjectUrl(beforeRef.current);
    beforeRef.current = url;
    setBeforeUrl(url);
  }, []);

  const setAfterFromFile = useCallback((file: File | Blob) => {
    revokeGlbObjectUrl(afterRef.current);
    const url = createGlbObjectUrl(file);
    afterRef.current = url;
    setAfterUrl(url);
  }, []);

  const setAfterFromUrl = useCallback((url: string) => {
    revokeGlbObjectUrl(afterRef.current);
    afterRef.current = url;
    setAfterUrl(url);
  }, []);

  const clear = useCallback(() => {
    revokeGlbObjectUrl(beforeRef.current);
    revokeGlbObjectUrl(afterRef.current);
    beforeRef.current = null;
    afterRef.current = null;
    setBeforeUrl(null);
    setAfterUrl(null);
  }, []);

  useEffect(
    () => () => {
      revokeGlbObjectUrl(beforeRef.current);
      revokeGlbObjectUrl(afterRef.current);
    },
    [],
  );

  return {
    beforeUrl,
    afterUrl,
    hasCompare: Boolean(beforeUrl && afterUrl),
    snapshotBefore,
    snapshotBeforeFromUrl,
    setAfterFromFile,
    setAfterFromUrl,
    clear,
  };
}
