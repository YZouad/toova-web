# Delta: Current → Target — Toova

**From:** `.telemetry/current-state.yaml` (7 defined events, 7 live, 0 orphaned — GA4 via custom gtag wrapper)
**To:** `.telemetry/tracking-plan.yaml` v2 (15 events — GA4, `object_action` naming)

This is the implementation backlog for **product-tracking-generate-implementation-guide**.

**v2 note (2026-09-03):** v1 of this delta targeted PostHog. PostHog was implemented and reverted the same day — the founder's call was to stay on GA4 rather than add another analytics vendor. The add/remove/rename accounting below is unchanged from v1; only event names (dots flattened to underscores, per GA4's naming rules) and the destination-specific notes changed.

## Add (not tracked today) — 9 events

| Event | Category | Why |
|---|---|---|
| `model_generation_started` | core_value | The AI 3D-generation pipeline (Trellis wake → status → generate) has zero tracking today. |
| `model_generation_succeeded` | core_value | Same — completion side of the funnel. |
| `model_generation_failed` | core_value | Same — failures in an idle-stopped EC2 pipeline are currently invisible. |
| `checklist_item_added` | core_value | The checklist itself is untracked; only the affiliate click at the end of it is. |
| `room_liked` | collaboration | Gallery engagement (likes) is written straight to Supabase with no analytics signal. |
| `catalog_searched` | navigation | Feeds the two core revenue loops (item placement, affiliate clicks); currently invisible. |
| `plan_upgraded` | billing | Roadmap — no billing system exists yet. Included now so the schema is ready at launch. |
| `plan_cancelled` | billing | Roadmap — same reason. |
| `limit_reached` | billing | Roadmap — this is the event that will drive the upgrade funnel once tiers exist. |

## Remove (tracked today, shouldn't be, in this plan) — 1 event

| Current Event | Why Remove |
|---|---|
| `page_view` | Blanket page-view tracking inflates event volume with little analytical return. Feature-engagement events (`room_created`, `design_item_added`, etc.) already cover the meaningful navigation signal. GA4's automatic page-view collection is unaffected by this — this plan only removes the app's *manual* `trackPageView()` calls, which duplicated it. |

## Rename / Change (tracked today, name and/or shape changes) — 6 events

| Current Name | Target Name | Changes |
|---|---|---|
| `create_room` | `room_created` | **Corrected 2026-09-03:** this is LIVE today (`useRoomLayout.ts:363`, inside `createRoomWithGeometry`) — the original audit missed this file and wrongly called it orphaned. The real fix: it currently fires with zero properties, so add `room_id` (the new room's id, available at the call site), `template_id` (threaded through from `options?.starterId` in `App.tsx`'s `handleCreateWithPlan`), and `is_guest` (true only on the guest-conversion call site, `App.tsx`). Also: a guest session that never signs up never fires this event at all — `createRoomWithGeometry` is only reached post-auth. That gap is inherent to the current architecture (there's no room row to attribute the event to pre-signup) and isn't closed by this delta; flagging it as a known limitation. |
| `add_to_design` | `design_item_added` | Rename. Add `room_id` (missing today). Make `source` **required** — the property exists in code but is never populated at either call site today. |
| `share_room` | `room_shared` | Rename. Add `room_id` (missing today). |
| `click_affiliate` | `product_affiliate_clicked` | Rename. `approximate` → `is_price_approximate`. Otherwise unchanged — this is the one event that's already correctly instrumented at all 4 call sites. |
| `sign_up` | `account_signed_up` | Rename. Add `converted_from_guest` (new — not observable today, needs `guestDesignSnapshot` state at signup time) and `user_id`. **Corrected 2026-09-03:** `method`'s enum is `[email, google, facebook]`, not `[email, google]` — `AuthPage.tsx` offers Facebook OAuth alongside Google; the original design pass missed it. |
| `login` | `account_logged_in` | Rename only, no shape change. **Corrected 2026-09-03:** same `method` enum fix as above — `[email, google, facebook]`. |

## Keep (unchanged) — 0 events

Every currently-tracked event is renamed under the new `object_action` convention (see naming-convention decision below), so nothing carries over unchanged.

---

**Accounting check:** Add (9) + Rename/Change (6) + Keep (0) = **15**, matching the 15 events in `tracking-plan.yaml`. ✓ (`page_view` is Removed, not counted toward the target.)

## Decisions Locked In This Phase

- **Destination:** GA4 only (**changed 2026-09-03, v1→v2**: PostHog was the v1 decision, implemented same-day, then reverted — the founder's call was to keep the stack smaller rather than add a second analytics vendor alongside Cloudflare, Supabase, and AWS). There is no separate "marketing GA4" to reconcile with — GA4 is simply the one destination for everything in this plan.
- **Naming convention:** switching from flat `snake_case` (`create_room`) to `object_action` (`room_created`) — conceptually PostHog's `object.action` convention, flattened because **GA4 event names cannot contain periods** (letters/digits/underscores only, ≤40 chars). This still breaks any existing GA4 dashboards or saved filters built on the old event names — confirmed with the user as an acceptable tradeoff when the naming convention was first decided.
- **PII policy: `none`** (**changed 2026-09-03, v1→v2**: was `traits_only` for PostHog). Google's gtag/Measurement Protocol terms prohibit sending PII — email, name — as event params **or** user properties, which is stricter than a typical CDP's identify-trait model. `email` and `display_name` are dropped from the plan entirely, not just kept out of event properties.
- **Internal users:** admin-role users are excluded from analytics at the tracking layer (guarded by the `role` trait), not filtered after the fact in GA4.
- **Identity:** the current implementation has zero `identify()`-equivalent calls — every event today is anonymous/session-scoped. The target plan calls `gtag('set', { user_id })` plus a small set of non-PII user properties on login/signup — GA4's closest equivalent to identify(), scoped down for its no-PII rule.

## Known Limitation Carried Into the Plan

`product_affiliate_clicked` (and its `affiliate_clicks_count` snapshot trait) measure click-through, not confirmed purchases — Toova has no retailer webhook to confirm a sale actually happened. If true revenue tracking becomes a priority, that requires either a retailer-side integration or a manual "I bought this" confirmation step in the UI, neither of which exists today.
