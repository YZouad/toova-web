# src/lib — domain helpers & clients

Largest concentration of non-UI logic. Prefer editing here over stuffing `store.ts` or page components.

## Clusters (grep by name)

| Cluster | Examples |
|---------|----------|
| Room geometry / floor plan | `roomGeometry.ts`, `floorPlanGeometry.ts`, `roomLayoutSerialize.ts` |
| Appearance / environment / polish | `roomAppearance.ts`, `environment.ts`, `environmentPersist.ts`, `roomPolish*` |
| Gallery / sharing / profiles | `galleryCatalog*`, `roomGallery*`, `roomShares.ts`, `shareLinks.ts`, `profiles.ts` |
| Catalog / shopping / affiliates | `shoppingCatalog*`, `affiliateLinks.ts`, `dormChecklist.ts`, `catalogCategories.ts` |
| Import / GLB pipeline | `prepareImportedGlb.ts`, `normalizeImportedMaterials.ts`, `importedItemSize.ts`, `decimateGlb.ts`, `glbBounds.ts` |
| Trellis / Thrixel / generation | `trellisApi.ts`, `thrixelApi.ts`, `preparePhotoForTrellis.ts`, `generationQueue.ts` |
| Storage | `modelStorage.ts`, `roomThumbnailStorage.ts`, `profileStorage.ts`, `beddingStorage.ts` |
| Analytics / admin | `analytics.ts`, `adminAnalytics.ts`, `adminUserOverview.ts` |
| Hanging decor | `hangingDecorGeometry.ts` |
| Bedding | `bedding/` |

## Notes

- Supabase client: `supabase.ts`. Most data access is thin wrappers over it + RPCs defined in `supabase/migrations/`.
- Thumbnail / turntable rendering helpers are heavy (Three.js offscreen); touch carefully and keep tests green (`*.test.ts` nearby).
- Do not put React components here; hooks that call these live in `src/hooks/`.
