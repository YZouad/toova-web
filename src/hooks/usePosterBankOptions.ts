import { useEffect, useState } from 'react';
import { loadPosterBankOptions, type PosterBankOption } from '../lib/posterBank';

export function usePosterBankOptions(enabled: boolean) {
  const [options, setOptions] = useState<PosterBankOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPosterBankOptions()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load posters');
          setOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { options, loading, error };
}
