# src/ui — pages & chrome

All primary React UI outside the R3F canvas. Design-system primitives live in `kit/`.

## Clusters

| Area | Examples |
|------|----------|
| Designer shell | `Designer.tsx`, `designer/`, `Dock.tsx`, `InspectorPanel.tsx`, `Sidebar.tsx`, `FloorPlan*` |
| Marketing / auth | `LandingPage.tsx`, `IntroPage.tsx`, `AuthPage.tsx`, `LoginPage.tsx`, `WelcomePage.tsx` |
| Gallery / rooms / profiles | `Gallery*.tsx`, `RoomGallery*.tsx`, `PublicRoomPage.tsx`, `SharedRoomPage.tsx`, `ProfilePage.tsx` |
| Catalog / import | `ModelGallery.tsx`, `ImportModelModal.tsx`, `ProductDrawer.tsx` |
| Admin | `AdminConsole.tsx`, `AdminPortal.tsx`, `AdminShoppingPanel.tsx` |
| Billing | `billing/` |
| Shared chrome | `AppRailChrome.tsx`, `MarketingNav.tsx`, `kit/*` |

## Notes

- Prefer `kit/` components for new controls; match existing editorial visual language (see CSS vars in `src/app.css`).
- Designer mobile variants under `designer/mobile/`.
- Data fetching belongs in `hooks/` + `lib/`; UI should stay presentational where practical.
- Large “god” screens (`Designer.tsx`, `Dashboard.tsx`) — extend via extracted panels rather than growing them further when possible.
