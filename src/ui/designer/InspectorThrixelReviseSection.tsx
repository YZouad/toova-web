import { useEffect, useState } from 'react';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import { fetchOwnerCatalogGalleryModel } from '../../lib/fetchOwnerCatalogModel';
import { resolveBrowsableModelUrl } from '../../lib/modelStorage';
import { useStore } from '../../store';
import { ThrixelRevisePanel } from '../ThrixelRevisePanel';
import { Banner, MonoMeta } from '../kit';

export interface InspectorThrixelReviseSectionProps {
  catalogKind: string;
  userId: string;
}

export function InspectorThrixelReviseSection({
  catalogKind,
  userId,
}: InspectorThrixelReviseSectionProps) {
  const patchImportedCatalogModel = useStore((s) => s.patchImportedCatalogModel);
  const [model, setModel] = useState<GalleryModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchOwnerCatalogGalleryModel(catalogKind).then((row) => {
      if (!cancelled) {
        setModel(row);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [catalogKind]);

  if (loading) {
    return <MonoMeta size="sm" tone="subtle">Loading Thrixel revise…</MonoMeta>;
  }

  if (!model) {
    return <Banner tone="error">Could not load this model for Thrixel revision.</Banner>;
  }

  return (
    <ThrixelRevisePanel
      model={model}
      userId={userId}
      onRevised={(patch) => {
        void (async () => {
          const access = model.visibility === 'public' ? 'public' : 'private';
          const storagePath = patch.storagePath ?? model.storagePath;
          const signedUrl = storagePath
            ? await resolveBrowsableModelUrl(storagePath, { access })
            : model.signedUrl;
          setModel((current) =>
            current
              ? {
                  ...current,
                  ...patch,
                  storagePath,
                  signedUrl: signedUrl ?? current.signedUrl,
                }
              : current,
          );
          if (signedUrl && storagePath) {
            patchImportedCatalogModel(model.kind, {
              url: signedUrl,
              storagePath,
              catalogSizeIn:
                patch.width_in != null && patch.height_in != null && patch.depth_in != null
                  ? [patch.width_in, patch.height_in, patch.depth_in]
                  : undefined,
            });
          }
        })();
      }}
      onRoomItemsUpdated={(storagePath) => {
        void (async () => {
          const access = model.visibility === 'public' ? 'public' : 'private';
          const signedUrl = await resolveBrowsableModelUrl(storagePath, { access });
          if (signedUrl) {
            patchImportedCatalogModel(model.kind, {
              url: signedUrl,
              storagePath,
            });
          }
        })();
      }}
    />
  );
}
