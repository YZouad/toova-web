# src/scene — 3D room rendering

R3F scene graph for the designed room (not furniture meshes — those live in `../furniture/`).

## Owns

| File | Role |
|------|------|
| `Scene.tsx` | Canvas composition / wiring |
| `Room.tsx` | Room shell from geometry |
| `Wall.tsx`, `FloorCeiling.tsx`, `Baseboards.tsx`, `Openings.tsx` | Structure |
| `ProceduralSky.tsx`, `WeatherSystem.tsx`, `WindowLightShafts.tsx`, `RoomVolumetricHaze.tsx` | Atmosphere |
| `ScenePostProcessing.tsx`, `DemandFrameDriver.tsx` | Quality / render loop |
| `ObjectGizmo.tsx`, `SelectionHud.tsx`, `MobileSelectionHud.tsx`, `DimensionsOverlay.tsx` | Selection / measure UI in 3D |
| `useRoomMaterial.ts`, `useOrbitFade.ts`, `shadowLayers.ts` | Shared scene hooks/helpers |

## Notes

- Room dimensions / polygon come from zustand (`store.ts`) + `lib/roomGeometry.ts`.
- Appearance (paint, etc.) via `lib/roomAppearance.ts`; visual quality via `lib/renderQuality.ts`.
- Prefer changing materials/atmosphere helpers in `lib/` when the logic is shared with thumbnails/export; keep JSX composition here.
