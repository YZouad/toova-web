/** Agent JSON "build" docs — keep scripts/cursor-agentic-dev-server.mjs in sync. */
export const AGENTIC_BUILD_SCHEMA_DOCS = `Optional "build" on an item (only when the user named structure — keep query generic for shopping):

dresser / nightstand (prefer rows×columns; product = drawerRows × drawerColumns):
  {
    "drawerRows": number,
    "drawerColumns": number,
    "widthIn": number,
    "depthIn": number,
    "heightIn": number
  }
  Legacy: { "drawers": number, "columns": number, "drawerArrangement": "stack"|"wide"|"grid" }
  Always set widthIn/depthIn/heightIn (inches) so the 3D piece fits the room: use widthIn/depthIn from the JSON room size — small rooms (~10×10 ft) use narrower dressers (~24–28″ wide), standard dorms ~30″, larger rooms up to ~36″. Match drawer grid to width (each column ~14″).

desk (side cabinets and under-drawer can be combined):
  {
    "deskPedestal": "none"|"left"|"right"|"both",
    "deskPullOut": "none"|"front"|"center",
    "pullOutWidthIn": number,
    "pullOutDepthIn": number,
    "pullOutHeightIn": number,
    "deskBase": "legs"|"panels",
    "deskBackPanel": boolean,
    "drawerRows": number,
    "drawerColumns": number
  }
  Side cabinets only: set deskPedestal + drawerRows/drawerColumns (or drawers).
  Under-drawer only: set deskPullOut to "front" (full width at front) or "center".
  Executive + pencil drawer: deskPedestal "both", deskPullOut "front", optional pullOutWidthIn.
  Legacy deskPedestal "center"|"front" still maps to deskPullOut.

bookshelf: { "shelves": number, "bookshelfColumns": number, "back": boolean }
shelf: { "boards": number, "gap": number }
chair: { "style": "side"|"armchair"|"stool", "backStyle": "solid"|"slats" }
Any kind may include widthIn, heightIn, depthIn (inches) when the user gave dimensions.

Examples:
- 6-drawer dresser → { "drawerRows": 6, "drawerColumns": 1, "widthIn": 30, "depthIn": 18, "heightIn": 34 }
- 2×4 dresser grid → { "drawerRows": 2, "drawerColumns": 4, "widthIn": 60, "depthIn": 18, "heightIn": 22 }
- Compact dorm dresser → { "drawerRows": 4, "drawerColumns": 1, "widthIn": 26, "depthIn": 16, "heightIn": 32 }
- Desk with left pedestal and front pencil drawer → { "deskPedestal": "left", "drawerRows": 3, "drawerColumns": 1, "deskPullOut": "front", "pullOutWidthIn": 40, "pullOutDepthIn": 7, "pullOutHeightIn": 4 }
- Writing desk with filled sides → { "deskPullOut": "front", "deskBase": "panels", "deskBackPanel": true }`;
