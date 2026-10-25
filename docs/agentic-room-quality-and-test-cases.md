# Agentic room design — product requirements

Status: current system plus the quality bar we still hold it to
Related: [agentic-room-generation-spec.md](agentic-room-generation-spec.md) (earlier rules-only sketch; the live path is the Cursor agent below), [agentic-poster-bank.md](agentic-poster-bank.md)

This is the PRD for the "Describe your room" flow: who it is for, how the agent and the app split the work, what "good" means, and the cases we test.

---

## 1. What this tool is for

A user describes a room in plain language. For example: "my 10 by 12 bedroom, a bed, desk and plant, under $500, cozy vibe". The agent returns a **furnished 3D room** in Toova that is believable, fits the space, and respects their budget and style. It also gives a **shopping list** they can act on.

The agent is a **starting point generator**, not a final designer. The user should be able to say "yes, that's roughly what I wanted" in under a minute, then tweak by hand in the designer.

### Who the users are

| Persona | What they say | What they need |
|---|---|---|
| **Renter / first apartment** | "Small bedroom, bed, desk, cheap" | Fits the tiny space, low cost, no wasted items |
| **Student / dorm** | "Dorm room, 9x12, desk, bed, posters" | Compact layout, decor that fits the theme |
| **Gamer / creator** | "Gaming setup, dark, desk, monitor, LED vibe" | Style-forward, desk-centric layout |
| **Casual decorator** | "Cozy living room, couch, rug, plant, warm" | Mood and look over exact dimensions |
| **Planner / mover** | "12x15 living room, couch, TV, bookshelf" | Realistic spacing, doors and windows respected |
| **Non-technical / vague** | "make me a nice room" | Sensible defaults, not an error |

Design for the non-technical and vague users first. Power users can edit.

---

## 2. How the system works

There is **one AI agent**. It writes a shopping checklist. It does not place furniture, pick catalog SKUs, or build the 3D room. Everything after the checklist is deterministic client code.

### 2.1 The agent

| | |
|---|---|
| Runtime | **toova-bff** `POST /api/agentic-room/parse` (and `/revise`, `/analyze` for designer revise and room scan) |
| Model | Amazon Bedrock Converse (`BEDROCK_MODEL_ID`, default Claude Sonnet on Bedrock) |
| Auth | AWS credentials on the BFF (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) |

Dev wiring:

- `npm run dev` starts Vite. The app calls same-origin `/api/agentic-room/*`; Vite proxies to `TRELLIS_BFF_ORIGIN` (Render BFF by default).
- Production builds call `https://toova-bff.onrender.com/api/agentic-room` unless `VITE_AGENTIC_ROOM_API_URL` overrides it.

Prompts and JSON parsing live in **toova-bff** (`src/lib/agenticRoom/`). Client-side `agenticRoomParseJson.ts` mirrors parse/enrichment helpers and must stay aligned with the BFF where shared.

`parseAgenticRoomPrompt` (`src/lib/agenticRoomPrompt.ts`) is a leftover regex parser. It is covered by tests and is **not** on the live path.

### 2.2 What the agent owns, and what the app owns

| The agent returns | The app does after that |
|---|---|
| Room size (`widthIn`, `depthIn`, inches), or null | Defaults a missing size to **10 ft × 12 ft**. Builds a rectangle with `rectanglePlan`. |
| Soft budget (`budgetCents`) | Matches catalog prices, swaps in cheaper alternates when over budget, and flags `overBudget`. |
| `roomType` and free-text `theme` | Theme profile picks wall, floor, finishes, and poster bias (`agenticThemeProfile`, `agenticRoomVibe`). |
| `vibe`: `warm` \| `neutral` \| `studio` \| `moody` \| `sage` \| null | Maps that id onto the existing wall-color and floor presets. |
| `colorScheme`: 2–5 hex colors | Overrides walls and furniture finishes. Editable in `AgenticColorSchemeEditor`. |
| `windowCurtains`: enabled, hex color, openness 0–1 | Applied to every window on the plan. A shopping line for curtain fabric can still exist. |
| `items[]`: `query`, `qty`, `estimatedCents`, optional `build` | Resolves each line to a catalog product, poster-bank poster, procedural furniture kind, or affiliate search links. |
| `estimatedTotalCents` | Shown as the agent's rough total. The confirmed total uses real catalog prices. |

The agent must not invent brand names or product URLs. Search phrases stay generic for structural furniture (bed frame, desk, chair) and carry the theme on decor (bedding, rug, posters, lights). Drawer grids, desk pedestals, and shelf counts go in `build`, not in the shopping query.

### 2.3 Pipeline

Entry: new-room picker → **Describe your room** → `AgenticRoomFlow`.

1. **Suggest with AI.** The user types a free-text prompt (max 2,000 characters). `fetchAgenticFurnitureList` posts it to `/api/agentic-room/parse`. The UI shows progress while Bedrock runs (usually 30–90 seconds).
2. **Bedrock run.** The BFF sends the furniture-list system prompt via Converse and waits for completion (client abort ~95s).
3. **JSON recovery.** The BFF pulls a JSON object out of the model text (including a fenced block) and validates it. Empty or invalid JSON is an error, not a room.
4. **Client enrichment.** `enrichFurnitureListWithTheme` fills theme from the prompt when the agent omitted it, and can add room essentials, desk pairings, and catalog-bank extras.
5. **Review.** The user sees a checklist. They can change quantity, swap a catalog match, mark a line "already have" or "not needed", pick a community-gallery model, edit the color scheme, or remove a line.
6. **Resolve (no second model).** `resolveAgenticList` turns each line into a review row:
   - Catalog match when the search score is at least `AGENTIC_MATCH_MIN_SCORE` (45).
   - Poster-bank match for wall art (`agenticPosterMatch`), CC0 / public domain only.
   - Procedural builtin when there is no product.
   - Affiliate search links when there is no buyable product URL.
   - Community gallery suggestions for lines that still have no affiliate link (`agenticCommunityMatch`).
   - One greedy pass replaces a match with a cheaper alternate if the set is over budget.
7. **Enhance with AI (optional).** A second call to the same agent. New lines are merged into the existing checklist. The first list is not thrown away.
8. **Confirm.** `handleConfirm` builds the room:
   - `rectanglePlan` for the shell, then curtains.
   - Appearance from vibe, then theme, then `colorScheme`.
   - Lines marked skip or already-have are left out of placement. Already-have stays on the shopping manifest as owned.
   - `buildAgenticPackPieces` then `packAgenticRoomItems` (`arrangeRoomItems`): lamps snap onto a surface, posters prefer the bed wall, hanging decor spans walls. Pieces that do not fit are skipped and named.
   - Palette tints are applied, starter assets resolve, and the result is a normal editable room plus a shopping manifest.

**Build my own checklist** skips the agent. The list source is `manual`. The same resolve, community, and pack steps still run. Enhance with AI can be used on a manual list.

Saved checklists live in local storage (`agenticRoomSavedChecklists`). Guests follow the same local path as starter rooms until they sign in to save.

### 2.4 Agent JSON contract

```json
{
  "widthIn": 120,
  "depthIn": 144,
  "budgetCents": 50000,
  "roomType": "dorm bedroom",
  "theme": "gothic",
  "vibe": "moody",
  "estimatedTotalCents": 48000,
  "windowCurtains": { "enabled": true, "color": "#1f1a17", "openness": 0.35 },
  "colorScheme": ["#3a3a3a", "#c4b7a6", "#6b7f6a"],
  "items": [
    {
      "query": "queen bed frame",
      "qty": 1,
      "estimatedCents": 18000,
      "build": null
    }
  ]
}
```

List size guidance in the prompt: about 6–10 items for a typical dorm or bedroom, more for a larger room. Every dorm or bedroom list should include a bed frame, desk, chair, and desk lamp as separate generic lines, plus theme-specific decor (at least three) when a theme was named.

`source` on the parsed result is `bedrock` when the agent returned a usable list, `manual` for a hand-built checklist, or `rules-fallback` when the BFF call failed. That last label does **not** run the regex parser. The UI gets an empty list and a plain-language warning (missing AWS config, timeout, bad JSON, BFF down). Legacy saved checklists may still show `cursor` as an alias for AI-generated lists.

### 2.5 Failure behavior (current)

| Failure | What the user sees |
|---|---|
| Empty prompt | "Enter a room description." No agent call. |
| Prompt over 2,000 characters | Proxy rejects it. No agent call. |
| Missing AWS credentials on BFF | 503. Client warning mentions Bedrock / toova-bff. |
| Bedrock timeout or run failed | Empty list, warning, no room created. |
| Agent text is not valid checklist JSON | "Could not parse furniture list…" No partial room. |
| Client wait | Abort after 95 seconds. |

A failed generate does not replace an open design. Confirm is the only step that creates the room.

### 2.6 Code map

| Piece | Where |
|---|---|
| Describe-your-room UI | `src/ui/AgenticRoomFlow.tsx`, opened from `src/ui/RoomPresetPicker.tsx` |
| Browser → BFF | `src/lib/agenticRoomParseApi.ts`, `src/lib/agenticRoomApi.ts` |
| Bedrock routes | toova-bff `src/routes/agenticRoom.ts` |
| Prompt, JSON parse, theme fill-in | `src/lib/agenticRoomParseJson.ts` |
| Furniture `build` schema | `src/lib/agenticRoomBuildSchema.ts` |
| Catalog match and budget swap | `src/lib/agenticRoomResolve.ts`, `src/lib/agenticRoomResolveFromList.ts` |
| Posters, theme, curtains, color | `agenticPosterMatch`, `agenticThemeProfile`, `agenticRoomVibe`, `agenticColorScheme`, `agenticRoomWindowDressing` |
| Fit and pack | `agenticRoomFit`, `agenticRoomPack`, `agenticRoomPlacement` |
| Shopping list persisted with the room | `agenticShoppingManifest`, `agenticRoomApplyChecklist` |

---

## 3. Goals

1. **Understand messy human input.** Accept feet, inches, "10x12", "10 by 12", and missing fields without failing.
2. **Produce a layout that makes physical sense.** Nothing overlaps, nothing blocks doors, and furniture faces the right way.
3. **Respect constraints.** Room size, budget, and named items are treated as real requirements.
4. **Match the vibe.** Colors, floor, decor, and window dressing feel cohesive and not random.
5. **Fail gracefully.** Never show a blank screen or a raw error. Always return the best-effort room plus plain-language notes about what was skipped.
6. **Be fast and predictable.** The user sees progress, and the same prompt gives a similar result.
7. **Stay editable.** Everything the agent places is a normal item the user can move, delete, or swap.

### Non-goals (for now)

- Architectural accuracy (structural walls, code compliance)
- Multi-room or whole-home generation
- Custom L-shape or odd outlines from prose, unless explicitly named
- Perfect interior-design taste
- Replacing the manual designer

---

## 4. Expectations: what "working well" looks like

These are the quality bar. Where today's behavior differs, that is called out. Section 2 is what ships; this section is what we still require of it.

### 4.1 Input understanding

| Expectation | Pass criteria |
|---|---|
| Dimensions parsed from common formats | `10x12`, `10 by 12`, `10' x 12'`, `120in by 144in`, `3m by 4m` all give the right plan |
| Missing size has a sensible default | Agent picks a default (or asks once) and says so |
| Items recognized from casual words | "couch" matches sofa, "tv stand" matches media console, "lamp" matches floor or table lamp |
| Quantities respected | "two nightstands" gives 2, "a couple of plants" gives about 2 |
| Budget parsed | "$500", "under 500 dollars", "around $1k" all give about 50000 cents |
| Vibe words mapped | "cozy" maps to warm, "dark" maps to moody, and unknown words fall back to neutral with a note |
| Unknown items are skipped and reported | Never invent a product. Say "couldn't find: hammock" |

### 4.2 Layout and physical sanity

| Expectation | Pass criteria |
|---|---|
| Everything inside the room | No item footprint crosses a wall |
| No collisions | No two floor items overlap |
| Doors stay clear | Nothing in a door swing or footprint (see `starterItemsBlockingDoors`) |
| Windows respected | No tall furniture fully blocking a window unless there is no alternative |
| Sensible orientation | Beds have the headboard on a wall. Desks and sofas face into the room. TVs face the seating. |
| Sensible anchoring | Nightstands flank the bed. Lamps sit on a surface at the right height. Rugs sit under furniture. |
| Walking clearance | Roughly 24 to 30 inches of path between major pieces when space allows |
| Scales to the room | A tiny room gets fewer or smaller items. The agent does not cram everything in. |

### 4.3 Budget behavior

| Expectation | Pass criteria |
|---|---|
| Soft cap | Prefer cheaper matches to stay under budget |
| Over budget is flagged, not fatal | Return the room with `overBudget: true` and the actual total |
| Unpriced items are shown separately | Procedural builtins are labeled "unpriced" and excluded from the sum |
| Total is accurate | The shopping list total equals the sum of line items |

### 4.4 Style and cohesion

| Expectation | Pass criteria |
|---|---|
| Wall and floor match the vibe | Follows the vibe table in the spec |
| Decor matches the theme | A "space" theme gets space posters, and a "coastal" theme gets coastal ones |
| Color scheme is coherent | Item colors come from one palette and are not random |
| No trademarked or unsafe content | Poster and decor picks come from the CC0 / public-domain bank only |
| Window dressing is sensible | Curtains or blinds appear on windows when the vibe or prompt calls for them |

### 4.5 Communication and UX

| Expectation | Pass criteria |
|---|---|
| Clear progress | The user sees that the list is being built, then reviews it before a room exists. Today that is "Sending to Cursor…" and "Building your shopping list…". |
| Plain-language notes | "Skipped hammock (not in catalog). Over budget by $42." |
| Confirm before destroying work | **Today:** the flow only runs from the new-room picker ("Describe your room"), so it always creates a room. **Target:** running it inside an open room asks "Replace this room?" first. |
| Result is editable | Every placed item is selectable and movable, and undo works |
| Guests can use it | Works without an account, and the room persists locally until save |

### 4.6 Reliability

| Expectation | Pass criteria |
|---|---|
| Never crashes on bad input | Empty, gibberish, and huge inputs all give a friendly message |
| Malformed model output is handled | Invalid JSON is extracted from fences when possible (`extractJsonFromAgentText`). If it still will not validate, the user gets a clean error and no room. There is no second model and no rules-parser fallback. |
| Proxy or network failure is handled | Clear message (missing key, timeout, proxy down). No half-built room. |
| Reasonably deterministic | The same prompt gives a similar layout. Variation from the model is OK, but quality does not swing. Packing itself is deterministic for a given list. |
| Latency is acceptable | **Target:** a checklist on screen in under 15 seconds, with progress after 2 seconds. **Today:** the cloud agent usually takes 30–90 seconds, and the client aborts at 95 seconds. The progress copy already says so. |

---

## 5. Test cases

Each case lists the prompt, what should happen, and what must not happen. Group them by user intent. Run them manually before releases and automate the ones marked **[auto]** in vitest or Playwright.

### A. Happy path: typical users

| ID | Prompt | Expected | Must not |
|---|---|---|---|
| A1 **[auto]** | "10 by 12 bedroom with a bed, desk, and nightstand, under $500, cozy" | Bedroom plan 120x144in. Bed on a wall, nightstand beside it, desk placed. Warm wall and floor. Total at or under $500, or flagged. | Overlap, blocked door, missing items without a note |
| A2 | "Small dorm room 9x11, bed, desk, bookshelf, posters, budget $300" | Compact layout, 2 to 3 posters from the bank, budget respected | Cramming past the room's capacity |
| A3 | "12x15 living room, sofa, coffee table, TV stand, rug, plant, neutral" | Sofa faces TV, rug under the coffee table and sofa front, plant in a corner | TV behind the sofa, rug off to one side |
| A4 | "Home office 8x10, desk, chair, bookshelf, studio vibe" | Desk with chair tucked in, shelf on a wall, light studio colors | Chair inside the desk geometry or facing a wall |
| A5 | "Gaming room, dark and moody, desk, monitor, chair, LED lights" | Moody palette, desk-centric layout | Bright default colors |
| A6 | "Cozy reading nook, armchair, floor lamp, bookshelf, plant" | Small cluster, lamp near the chair | Lamp floating or clipped into a wall |

### B. Input format and wording

| ID | Prompt | Expected |
|---|---|---|
| B1 **[auto]** | "10x12", "10 x 12", "10 by 12", "10' by 12'" | All give the same plan |
| B2 **[auto]** | "120 by 144 inches" | Same as 10x12 feet |
| B3 **[auto]** | "3m by 4m" | Converted correctly, or a friendly unit prompt |
| B4 **[auto]** | "$500", "500 dollars", "under 500", "around $1k" | Budget parsed to cents |
| B5 | "couch" / "sofa" / "loveseat" | All resolve to a seating item |
| B6 | "two nightstands" / "2 nightstands" / "a pair of nightstands" | Quantity 2 |
| B7 | Mixed case, extra punctuation, typos ("bedrom", "nighstand") | Still understood, or the closest match with a note |
| B8 | Order variations ("a $400 sage bedroom, 10 by 12, with a bed") | Same result as a normal order |

### C. Vague or incomplete prompts

| ID | Prompt | Expected |
|---|---|---|
| C1 | "make me a nice room" | A default room (for example 12x12 bedroom or living room), neutral vibe, sensible basics, and a note on what was assumed |
| C2 | "bedroom" | Default size, bed plus nightstand, no budget cap |
| C3 | "a room with a desk" | Default size, desk plus chair |
| C4 | "cheap" or "$200" only | Default room, budget applied, minimal furniture |
| C5 | "cozy" only | Default room, warm vibe |
| C6 | No size but items ("bed, desk, dresser, couch, TV, bookshelf") | A default size large enough, or a note that it's cramped |

Expected behavior for all C cases: **produce a room and say what you assumed**. Do not return a hard error.

### D. Constraints and conflicts

| ID | Prompt | Expected |
|---|---|---|
| D1 **[auto]** | "6x8 room with a king bed, sofa, desk, and dresser" | Fits what it can, prioritizes the bed, and lists skipped items with the reason "doesn't fit" |
| D2 **[auto]** | "10x12 bedroom with a bed, $50" | Returns a room with `overBudget: true`, the actual total, and cheaper suggestions |
| D3 | "Queen bed in a 7x7 room" | Warns that clearance is tight, or picks a smaller bed size (see `agenticBedSize`) |
| D4 | "20 plants in a 10x10 room" | Caps at a sensible count with a note, or places them without blocking paths |
| D5 | "Bedroom, no bed" | Respects the negation |
| D6 | "Sofa and TV facing each other, 8x8" | Tight but valid, with a clearance warning |
| D7 | Room has a door and a window in the middle of the longest wall | The bed goes on another wall, and the door and window stay clear |

### E. Style and theme

| ID | Prompt | Expected |
|---|---|---|
| E1 **[auto]** | Each vibe word (warm, neutral, studio, moody, sage) | Maps to the correct wall and floor per the spec |
| E2 **[auto]** | "coastal", "maximalist", "boho" (not in the vocabulary) | Falls back to neutral with a note, and the closest theme is used for posters if available |
| E3 | "Space themed kid's room" | Space posters from the bank, bright and safe palette |
| E4 | "Gothic bedroom" | Moody palette, gothic poster if available |
| E5 | "Minecraft room" or "Harry Potter room" | No trademarked art. Falls back to a generic theme (for example "pixel", "magic") with a note. |
| E6 | "Sage green and cream color scheme" | Palette applied across wall and items, editable in the color scheme editor |
| E7 | "Curtains on the window" | Window dressing added |

### F. Items and catalog

| ID | Prompt | Expected |
|---|---|---|
| F1 **[auto]** | "hammock", "treadmill", "aquarium" (unsupported) | Listed as "couldn't find", and the rest of the room is still built |
| F2 | "an IKEA desk" | Best catalog match with a note, no brand invention |
| F3 | "a rug" | Appears under or in front of furniture, sized for the room |
| F4 | "wall art" | Posters on walls at a sensible height and not behind furniture |
| F5 | "bookshelf with books" | Shelf placed, and books included only if supported |
| F6 | Items that exist only as community or imported 3D models | Matched where possible (see `agenticCommunityMatch`) |

### G. Layout quality (spot-check visually)

For every generated room above, check:

- [ ] No clipping through walls or other furniture
- [ ] Bed headboard is against a wall
- [ ] Desk chair is on the open side of the desk
- [ ] Sofa and TV face each other and are a sensible distance apart
- [ ] Lamps sit on a surface or the floor, not midair
- [ ] Rugs lie flat on the floor and are under furniture
- [ ] Posters hang at eye level on free wall space
- [ ] Doors can open and a person can walk in
- [ ] The room looks lived-in and not like a furniture warehouse

### H. Errors and robustness

| ID | Scenario | Expected |
|---|---|---|
| H1 **[auto]** | Empty prompt | "Tell me about your room" and no crash |
| H2 **[auto]** | Gibberish ("asdf qwer") | Friendly "I didn't understand" with example prompts |
| H3 **[auto]** | Very long prompt (2,000+ characters) | Truncated or summarized, no crash |
| H4 **[auto]** | Agent returns invalid JSON | Fenced JSON is recovered. Otherwise a clean error and no room (see section 2.5) |
| H5 | BFF or network is down | Retry message, no partial room. Warnings mention toova-bff / Bedrock config |
| H6 | User cancels mid-generation | State is clean, original room untouched |
| H7 | Non-English prompt | Best effort, or a polite "English only for now" |
| H8 | Prompt contains unsafe or inappropriate content | Refused politely, per the child safety policy |
| H9 | Absurd size ("1000 by 1000", "0 by 0") | Clamped or rejected with a clear message |

### I. Integration with the app

| ID | Scenario | Expected |
|---|---|---|
| I1 | Describe your room from the new-room picker | Creates a new room after the user confirms the checklist |
| I2 | Run inside an open room | **Not built.** Target: ask "Replace this room?" first |
| I3 | Guest user generates a room | Works and persists locally, with a sign-in prompt only on save |
| I4 | After generation, the user moves, deletes, or swaps items | Everything is editable and undo works |
| I5 | Shopping list | Links, prices, and totals are correct, and unpriced items are labeled |
| I6 | Save and reload | The room is restored identically |
| I7 | Mobile | The flow works on a small screen (see `e2e/designer-mobile.spec.ts`) |

### J. Consistency

| ID | Scenario | Expected |
|---|---|---|
| J1 | Run the same prompt 5 times | Layouts may vary, but all pass the sanity checks in section 4.2 |
| J2 | Re-run with a small change ("add a plant") | The result stays similar and does not reshuffle everything |

---

## 6. Success metrics

Track these from real usage and from the test set above.

| Metric | Target |
|---|---|
| Parse success (room produced, no hard error) | 99% or more |
| Zero collisions and zero blocked doors | 100% of generated rooms |
| All requested, supported items placed (or reported) | 95% or more |
| Within budget, or clearly flagged | 100% |
| Time to checklist on screen | Target under 15 s (p90). Today the agent wait is usually 30–90 s |
| User keeps the room and edits it (not discard) | Track over time |
| "Regenerate" rate | Lower is better |
| Thumbs-up or down on result | Track over time |

---

## 7. Test prompt starter set (copy and paste)

1. 10 by 12 bedroom, bed, desk, nightstand, under $500, cozy
2. 9x11 dorm, bed, desk, bookshelf, space posters, $300
3. 12x15 living room with sofa, coffee table, TV stand, rug, plant, neutral
4. 8x10 home office, desk, chair, bookshelf, studio
5. dark gaming room with a desk and chair
6. 6x8 room with a king bed, sofa, desk, and dresser
7. 10x12 bedroom with a bed for $50
8. make me a nice room
9. sage green bedroom 10x12 with curtains
10. gothic bedroom with a bed and nightstand, moody
11. room with a hammock and a treadmill
12. (empty)
13. asdf qwer zxcv

### Room scan (photo / video) appearance

Automated (Vitest):

- **Twin dorm photo fixture** — manifest JSON with `appearance.floorPreset: lightOak`, `rugColor` / `colorScheme` containing green (`#1B4332`) and navy bedding (`#1A365D`), `floorPatternApproximated: true` → `manifestToFurnitureList` sets `list.scanAppearance` and `list.colorScheme`; `mergeScanAppearanceIntoEnvironment` applies `lightOak` floor and scheme wall.

Manual (reference photo: symmetric twin beds, herringbone pale floor, dark green rug, navy/green bedding):

1. Scan the photo → review **Photo match** swatches (wall, floor preset, rug).
2. **Sample colors from photo** updates scheme without re-running vision.
3. Pick **light oak** floor chip if vision chose concrete/gray.
4. Create room → walls and floor preset match review; rug and bedding tints closer to photo than vibe-only defaults.

---

## 8. Open questions for the team

- What default room size and type should "make me a nice room" use? The client already defaults a missing size to 10×12 ft after the agent returns.
- Do we ask one clarifying question for vague prompts, or always assume and explain? Today the agent is told to assume.
- What is the max item count per room size? The prompt asks for about 6–10 items in a dorm or bedroom.
- Should "regenerate" keep or discard user edits? Enhance with AI currently merges into the existing list.
- Which of the **[auto]** cases should run in CI versus a manual pre-release pass?
- When does this leave the local Cursor proxy and get a real BFF route?
