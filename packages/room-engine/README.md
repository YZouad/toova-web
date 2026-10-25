# room-engine

Shared TypeScript for agentic catalog matching, theme profiles, and `arrangeRoomItems` (with `pinnedIds` for LiDAR scan furniture).

**Source of truth:** merge `feature/agentic-room-pack` into `main`, then move pure modules from `src/lib/` here:

- `agenticRoomResolve*`, `agenticThemeProfile`, `agenticRoomVibe`, `agenticColorScheme`
- `roomLayoutArrange`, `floorClearance`, `floorPlanGeometry`, `furnitureBuild`

**Consumers:** `toova-web` (Vite) and `toova-bff` (`src/lib/roomEngine/` — interim copy until this package is wired).
