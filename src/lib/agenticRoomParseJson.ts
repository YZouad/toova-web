import type { AgenticItemAsk, AgenticVibeId } from './agenticRoomPrompt';
import { parseVibeToken } from './agenticRoomVibe';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';

const VIBE_IDS = new Set<AgenticVibeId>(['warm', 'neutral', 'studio', 'moody', 'sage']);

/** Shared with scripts/cursor-agentic-dev-server.mjs — keep in sync. */
export function buildCursorFurniturePrompt(userPrompt: string): string {
  return `You are a furniture and decor shopping assistant. Given a room description, produce a buyable shopping checklist with rough price estimates.

Return ONLY valid JSON. No markdown fences, no commentary, no prose before or after the JSON.

The user may describe:
- Room size (e.g. 10x12 feet, 12 by 10)
- Room type (dorm, bedroom, studio apartment, home office, living room, etc.)
- Theme or style (gothic, minimalist, cozy, modern, sage, moody, etc.)
- Budget (e.g. under $500, $800 total)
- Must-have items they already know they want

Your job: infer a complete shopping list of physical items they should search for and buy to furnish that room, even if not every item was named explicitly.

Schema:
{
  "widthIn": number | null,
  "depthIn": number | null,
  "budgetCents": number | null,
  "roomType": string | null,
  "theme": string | null,
  "vibe": "warm" | "neutral" | "studio" | "moody" | "sage" | null,
  "estimatedTotalCents": number | null,
  "items": [
    {
      "query": string,
      "qty": number,
      "estimatedCents": number
    }
  ]
}

Rules for items:
- Each item must be a buyable furniture or decor product (queen bed, desk lamp, area rug, hangers, shelf unit, dresser, mirror, etc.)
- query = short search phrase you'd type into a store (e.g. "queen bed frame", "blackout curtains", "over-door hooks")
- Include commonly needed pieces for the room type and size, not only words copied from the description
- NEVER list adjectives, room types, themes, or vibes as items (bad: "gothic", "bedroom", "cozy")
- NEVER list built-in architecture as items unless shopping for organizers (bad: "closet" — good: "closet organizer")
- qty defaults to 1
- estimatedCents = rough USD cents for that entire line (unit price × qty). Use realistic budget-store estimates, not luxury pricing.
- estimatedTotalCents = sum of all line estimatedCents; keep near budgetCents when a budget was given
- widthIn/depthIn in inches (10x12 feet = 120 x 144)
- budgetCents in USD cents ($500 = 50000)
- roomType = short label for the room (e.g. "dorm bedroom")
- theme = style adjective or phrase from the description (e.g. "gothic", "minimalist")
- vibe = map theme to one of warm/neutral/studio/moody/sage when obvious, else null
- Do not invent brand names or product URLs
- Typical dorm/bedroom: 6–10 items. Larger rooms may have more.

Room description:
${userPrompt.trim()}`;
}

/** Pull the first JSON object from agent assistant text. */
export function extractJsonFromAgentText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseItem(raw: unknown): AgenticItemAsk | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const query = typeof o.query === 'string' ? o.query.trim() : '';
  if (!query) return null;
  const qtyRaw = o.qty;
  const qty =
    typeof qtyRaw === 'number' && Number.isFinite(qtyRaw) && qtyRaw > 0
      ? Math.floor(qtyRaw)
      : 1;
  const estRaw = o.estimatedCents;
  const estimatedCents =
    typeof estRaw === 'number' && Number.isFinite(estRaw) && estRaw >= 0
      ? Math.round(estRaw)
      : undefined;
  return estimatedCents != null ? { query, qty, estimatedCents } : { query, qty };
}

function parseOptionalNumber(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined;
  return v;
}

function parseOptionalString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed || undefined;
}

function parseVibe(v: unknown): AgenticVibeId | undefined {
  if (typeof v !== 'string') return undefined;
  const parsed = parseVibeToken(v.trim());
  return parsed ?? undefined;
}

function sumItemEstimates(items: AgenticItemAsk[]): number | undefined {
  let total = 0;
  let any = false;
  for (const item of items) {
    if (item.estimatedCents != null) {
      total += item.estimatedCents;
      any = true;
    }
  }
  return any ? total : undefined;
}

export function validateFurnitureListJson(raw: unknown): AgenticFurnitureListResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;

  const items = itemsRaw.map(parseItem).filter((x): x is AgenticItemAsk => x != null);
  if (items.length === 0) return null;

  const vibeRaw = o.vibe;
  let vibe: AgenticVibeId | undefined;
  if (typeof vibeRaw === 'string' && VIBE_IDS.has(vibeRaw as AgenticVibeId)) {
    vibe = vibeRaw as AgenticVibeId;
  } else {
    vibe = parseVibe(vibeRaw);
  }

  const estimatedTotalCents =
    parseOptionalNumber(o.estimatedTotalCents) ?? sumItemEstimates(items);

  return {
    items,
    widthIn: parseOptionalNumber(o.widthIn),
    depthIn: parseOptionalNumber(o.depthIn),
    budgetCents: parseOptionalNumber(o.budgetCents),
    roomType: parseOptionalString(o.roomType),
    theme: parseOptionalString(o.theme),
    vibe,
    estimatedTotalCents,
    warnings: [],
    source: 'cursor',
  };
}

export function parseAgentTextToFurnitureList(text: string): AgenticFurnitureListResult | null {
  const raw = extractJsonFromAgentText(text);
  return validateFurnitureListJson(raw);
}

/** Cursor Cloud Agents API returns terminal run text in `result` (string). */
export function extractRunTextFromCursorResponse(run: unknown): string {
  if (!run || typeof run !== 'object') return '';
  const o = run as Record<string, unknown>;
  if (typeof o.result === 'string') return o.result;
  if (typeof o.text === 'string') return o.text;
  if (o.result && typeof o.result === 'object') {
    const nested = o.result as Record<string, unknown>;
    if (typeof nested.text === 'string') return nested.text;
  }
  return '';
}
