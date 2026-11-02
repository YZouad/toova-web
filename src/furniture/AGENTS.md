# src/furniture — item meshes & registry

Builtin procedural furniture, imported GLB wrapper, and the kind registry used by the designer.

## Owns

| File | Role |
|------|------|
| `registry.ts` | `FurnitureKind`, sizes, metadata — **start here** for new kinds |
| `ItemsLayer.tsx` | Places all items into the scene from store |
| `ImportedModel.tsx` | User/AI GLB instances |
| `Selectable.tsx`, `SelectionOutline.tsx` | Selection chrome |
| `HangingDecoration.tsx` | Wall/ceiling hanging items |
| `Bed.tsx` + `bedding/` | Bed + bedding layers |
| `*Emitter*`, `LightSource.tsx`, `Lamp.tsx` | Lights |
| Builtin kinds | `Chair`, `Desk`, `Dresser`, `Nightstand`, `Wardrobe`, `Shelf`, `Bookshelf`, … |

## Notes

- Placement validity / gravity / wall shelves: `../interaction/collision.ts` (not here).
- Finish / tint helpers: `lib/furnitureFinish.ts` and `useFurnitureFinish.ts`.
- Adding a kind: register in `registry.ts`, add mesh component, wire `ItemsLayer` if needed, update any catalog/checklist mappings in `lib/`.
