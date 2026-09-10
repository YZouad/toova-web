# Agentic room generation — spec

User prompt: *“a room that's X by Y, with [items], around a $Z price point, [vibe] vibe.”*

This spec maps each field onto code that already exists so the first implementation slice is wiring, not design. Placement/rotation bugs in `roomStarterTemplates.ts` are assumed fixed before this ships — an agentic builder would inherit them.

**Status:** spec only. Review with the team before implementation.

---

## 1. Input schema

Parse the free-text prompt into this structured object (TypeScript, proposed `src/lib/agenticRoomPrompt.ts`):

```ts
export interface AgenticRoomRequest {
  /** Interior width in inches (X). */
  widthIn: number;
  /** Interior depth in inches (Y). */
  depthIn: number;
  /** Optional wall height; default ROOM.height (96). */
  heightIn?: number;
  /** Catalog / furniture kinds the user named. */
  items: AgenticItemAsk[];
  /** Soft budget in USD cents. Omit if the user didn't name a price. */
  budgetCents?: number;
  /** Maps onto appearance() presets (wallColor + floorPreset). */
  vibe?: AgenticVibeId;
}

export interface AgenticItemAsk {
  /** Raw token from the prompt (“nightstand”, “ikea desk”). */
  query: string;
  /** Resolved catalog product id, or a procedural FurnitureKind if no product. */
  productId?: string;
  kind?: FurnitureKind;
  qty: number;
}

export type AgenticVibeId =
  | 'warm'      // light plaster + lightOak  (bedroom-simple today)
  | 'neutral'   // cfc7b8 + lightOak
  | 'studio'    // f2efe8 + concrete
  | 'moody'     // 1f4f4f / 3a3a3a + concrete or lightOak
  | 'sage';     // 6b7f6a + lightOak
```

Validation:

- `widthIn` / `depthIn` must pass `rectanglePlan` / `lShapePlan` minimums (`MIN_WALL_LENGTH * 2`).
- Unknown item tokens are kept as `query` and skipped at placement (surface a warning), not invented.
- `budgetCents` is a *soft cap*: prefer cheaper catalog matches; if the selected set still exceeds Z, return the set plus `overBudget: true` rather than failing the whole room.

---

## 2. Field → existing function

| Prompt field | Existing system | Call |
|---|---|---|
| **X by Y** | Floor plan | `rectanglePlan(widthIn, depthIn, heightIn)` in `src/lib/floorPlanGeometry.ts` — same `FloorPlan` shape `buildPlan()` returns in `roomStarterTemplates.ts`. L / custom outlines are out of v1 unless the prompt names “L-shaped”; then `lShapePlan(...)`. |
| **[items]** | Catalog + starter placement | Resolve each token against `src/lib/shoppingCatalog.ts` (published products, `kind`, GLB). Fall back to procedural `FurnitureKind` in `src/furniture/registry.ts`. Place with the same `StarterFloorSeed` / `floorItems` conventions as `roomStarterTemplates.ts` (`position`, `rotationY` facing into the room, lamps on surface Y, no door-footprint overlap). Materialize via `materializeStarterItems` or a sibling `materializeAgenticItems(plan, seeds)`. |
| **$Z price point** | Real prices | Sum / filter `priceCents` on catalog products (`src/lib/shoppingCatalogAdmin.ts`, `src/lib/affiliateLinks.ts`). Procedural builtins have no `priceCents` — treat as $0 for the cap or exclude them from the budget math (spec decision: **exclude builtins from the sum**, show them as “unpriced”). |
| **vibe** | Appearance presets | `appearance({ wallColor, floorPreset })` already used per template in `roomStarterTemplates.ts`. Map `AgenticVibeId` → those two fields (table below). Do **not** invent a new material system for v1. |

### Vibe vocabulary vs today

Today’s templates only encode vibe as `wallColor` + `floorPreset` (and occasionally `recessedLights`). That is enough for v1. A bigger vocabulary (art, rug palettes, lighting recipes) is **not** required until someone wants more than five named looks.

| Vibe id | wallColor | floorPreset | source |
|---|---|---|---|
| `warm` | `#d8d0c2` | `lightOak` | bedroom-simple |
| `neutral` | `#cfc7b8` | `lightOak` | bedroom-balanced |
| `studio` | `#f2efe8` | `concrete` | office-simple |
| `moody` | `#3a3a3a` | `lightOak` | living-decorated |
| `sage` | `#6b7f6a` | `lightOak` | bedroom-decorated |

Unrecognised vibe words (`"coastal"`, `"maximalist"`) → `neutral` + a warning, not a failed parse.

---

## 3. Parser: LLM vs rules (v1)

**v1: rules-first parse in the client**, no `toova-bff` LLM.

The Command Palette already accepts free text (`src/ui/designer/CommandPalette.tsx`). Add a command / parser that:

1. Pulls `N by M` / `N x M` / `N′ × M′` (feet or inches) with a small unit helper (reuse `formatLength` / `inches()` in `src/units.ts`).
2. Pulls `$123` / `under $200` → `budgetCents`.
3. Pulls a vibe word against the `AgenticVibeId` list (and a few synonyms: cozy→warm, dark→moody).
4. Remainder tokens are item queries, matched with existing designer search (`src/lib/designerSearch.ts` / catalog kinds).

**v2 (later):** if recall on messy prompts is poor, add `POST /agentic-room-parse` on `toova-bff` that returns the same `AgenticRoomRequest`. Do not block v1 on an LLM. There is no OpenAI/Claude route in the BFF today.

---

## 4. Entry point

Extend the Command Palette rather than a new screen.

- New palette command: “Generate a room from a description”.
- On submit: parse → `rectanglePlan` → resolve items → pack into the current workspace (`hydrateLayout` + `hydrateRoomSettings`) **or** create a new room through the existing `handleCreateWithPlan` path in `src/App.tsx`.
- Prefer **new room** when the user is on the dashboard / preset picker; prefer **replace current plan** only when they are already in the designer and the prompt is run from the palette. Surface a one-line confirm: “Replace this room?” vs “Create a new room?”.

Guest path: same as starters — local store until save-auth (`guestDesignSnapshot.ts`). `templateId` on that snapshot is the old `RoomTemplateId` union; agentic rooms should pass `undefined` (or a future `'agentic'` id — that would be new code).

---

## 5. Placement (new vs reuse)

Reuse:

- `rectanglePlan` / `lShapePlan`
- `FURNITURE[kind].size` for footprints
- Door-clearance rule already encoded in `starterItemsBlockingDoors` (`roomStarterTemplates.ts`)
- Lamp Y = host surface `size[1]`
- `rotationY` facing inward from the nearest wall
- `materializeStarterItems` for store `Item`s
- `appearance()` / `env()` for vibe

New (genuinely new code, first slice):

1. `parseAgenticRoomPrompt(text): AgenticRoomRequest | ParseError` — client parser.
2. `resolveAgenticItems(ask[], budgetCents): ResolvedSeed[]` — catalog lookup + budget filter.
3. `packAgenticFloorItems(plan, seeds): StarterFloorSeed[]` — greedy pack along walls, skip door AABBs. This is the only non-trivial new algorithm; v1 can be “place along the longest wall left-to-right” rather than a full constraint solver.
4. Command Palette command + confirm copy.
5. Optional: `POST /agentic-room-parse` (v2).

Out of scope for v1: generated L-shape from prose, hanging décor, lighting recipes beyond `recessedLights`, multi-room, undo beyond existing store undo.

---

## 6. First implementation slice (when unblocked)

1. `src/lib/agenticRoomPrompt.ts` + tests for the regex parse.
2. `src/lib/agenticRoomPack.ts` — pack seeds into a `FloorPlan`, assert `starterItemsBlockingDoors` is empty.
3. Palette command that runs parse → pack → `handleCreateWithPlan` / hydrate.
4. Manual: type `10 by 12, bed and desk, under $400, sage vibe` in the palette and confirm a room loads.

Do not start this slice until this spec is reviewed with the team.
