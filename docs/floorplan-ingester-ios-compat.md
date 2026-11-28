# Floorplan ingester — `room_geometry` compatibility

The ingester stores the same `FloorPlan` v2 JSON in `rooms.room_geometry` as the hand-drawn editor.

## Additive fields

| Field | Shape | Older clients |
|-------|--------|----------------|
| `openings[].doorless` | optional `boolean` on `kind: "door"` | Ignored. Opening still looks like a normal door (casing + leaf if the client always draws a leaf). |
| Free-ended walls | vertices with degree 1 inside an enclosed loop | Already representable; iOS should already tolerate partition stubs if it loads arbitrary wall graphs. |

## Validation

`validateFloorPlan` on web no longer fails solely because of interior free ends. Clients that still require every vertex degree ≥ 2 may reject some imported plans until they adopt the same rule — or the user can delete the stub wall in the editor before save.

## iOS source

No iOS app tree is present under `Toova/` in this workspace. Before shipping:

1. Confirm the native decoder ignores unknown opening keys (`doorless`).
2. Confirm wall meshes / hole cutting tolerate degree-1 vertices that still sit inside a closed outer face.
3. If the app re-validates geometry client-side with a closed-loop-only check, either relax it or strip free stubs on import for that client.
