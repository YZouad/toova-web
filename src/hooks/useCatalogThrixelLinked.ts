import { useEffect, useState } from 'react';
import { fetchCatalogThrixelAsset } from '../lib/thrixelCatalogAssets';

/** True when the catalog model has a linked Thrixel submission (revise is available). */
export function useCatalogThrixelLinked(catalogKind: string | null | undefined): boolean {
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (!catalogKind) {
      setLinked(false);
      return;
    }
    let cancelled = false;
    void fetchCatalogThrixelAsset(catalogKind).then((result) => {
      if (!cancelled) setLinked(result.asset != null);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogKind]);

  return linked;
}
