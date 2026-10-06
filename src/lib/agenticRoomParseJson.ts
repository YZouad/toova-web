import type { AgenticItemAsk, AgenticVibeId } from './agenticRoomPrompt';
import { parseVibeToken } from './agenticRoomVibe';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import {
  posterQueryForProfile,
  resolveAgenticThemeProfile,
} from './agenticThemeProfile';

/** Vibes and generic styles — not shoppable themes like Minecraft or gothic. */
const THEME_SKIP = new Set([
  'warm',
  'cozy',
  'neutral',
  'studio',
  'office',
  'moody',
  'minimal',
  'minimalist',
  'modern',
  'simple',
  'contemporary',
  'clean',
  'basic',
]);

const DECOR_QUERY =
  /\b(bedding|comforter|sheets?|pillows?|rugs?|posters?|tapestry|curtains?|blankets?|throws?|lights?|duvets?|decals?|flags?)\b/i;

function shoppableTheme(theme: string | undefined): string | null {
  const trimmed = theme?.trim() ?? '';
  if (!trimmed || THEME_SKIP.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** Pull a named theme from casual free-form room descriptions. */
export function inferThemeFromPrompt(prompt: string): string | undefined {
  const text = prompt.trim();
  if (!text) return undefined;

  const patterns: RegExp[] = [
    /\b([a-z0-9][\w\s-]{0,30}?)\s+(?:theme|themed|vibe|aesthetic|style)\b/i,
    /\b(?:theme|style|vibe|aesthetic)\s*(?:is|:)?\s*["']?([a-z0-9][\w\s-]{0,30}?)["']?(?:\s|$|[,.])/i,
    /\b(minecraft|gothic|coastal|vintage|retro|anime|k-pop|harry potter|star wars|marvel|nintendo|zelda|pokemon|cottagecore|dark academia|light academia)\b/i,
  ];

  for (const re of patterns) {
    const match = re.exec(text);
    if (!match) continue;
    const raw = (match[1] ?? match[0]).trim().replace(/\s+(theme|themed|vibe|aesthetic|style)$/i, '');
    if (!raw || THEME_SKIP.has(raw.toLowerCase())) continue;
    return raw;
  }

  return undefined;
}

/** Fill missing theme from the user's words, then theme-prefix decor search lines. */
export function enrichFurnitureListWithTheme(
  list: AgenticFurnitureListResult,
  userPrompt: string,
): AgenticFurnitureListResult {
  const theme = shoppableTheme(list.theme) ?? inferThemeFromPrompt(userPrompt);
  const withTheme = theme ? { ...list, theme } : list;
  return ensureCatalogBankExtras(
    ensureRoomEssentials(applyNamedThemeToList(withTheme, userPrompt), userPrompt),
    userPrompt,
  );
}

function isBedroomLike(list: AgenticFurnitureListResult, userPrompt: string): boolean {
  const blob = `${list.roomType ?? ''} ${userPrompt}`.toLowerCase();
  return /\b(dorm|bedroom|studio apartment|sleep)\b/.test(blob);
}

/** Inject generic bed/desk/chair/lamp when a dorm/bedroom list omits essentials. */
export function ensureRoomEssentials(
  list: AgenticFurnitureListResult,
  userPrompt = '',
): AgenticFurnitureListResult {
  if (!isBedroomLike(list, userPrompt)) return list;

  const has = (re: RegExp) => list.items.some((item) => re.test(item.query));
  const hasDesk = list.items.some(
    (item) => /\bdesk\b/i.test(item.query) && !/\blamp\b/i.test(item.query),
  );
  const extras: AgenticItemAsk[] = [];

  if (!has(/\b(bed|mattress|bed\s+frame)\b/i)) {
    extras.push({ query: 'twin bed frame', qty: 1, estimatedCents: 18000 });
  }
  if (!hasDesk) {
    extras.push({ query: 'desk', qty: 1, estimatedCents: 12000 });
  }
  if (!has(/\b(chair|seating)\b/i)) {
    extras.push({ query: 'desk chair', qty: 1, estimatedCents: 8000 });
  }
  if (!has(/\blamp\b/i)) {
    extras.push({ query: 'desk lamp', qty: 1, estimatedCents: 2500 });
  }

  if (extras.length === 0) return list;
  const nextItems = [...list.items, ...extras];
  return {
    ...list,
    items: nextItems,
    estimatedTotalCents: nextItems.reduce((sum, item) => sum + (item.estimatedCents ?? 0), 0),
  };
}

function isDecoratableRoom(list: AgenticFurnitureListResult, userPrompt: string): boolean {
  const blob = `${list.roomType ?? ''} ${userPrompt}`.toLowerCase();
  return /\b(dorm|bedroom|studio|living|lounge)\b/.test(blob);
}

/** Inject catalog-bank decor lines (rug, lights, leaves, fridge) when missing from the list. */
export function ensureCatalogBankExtras(
  list: AgenticFurnitureListResult,
  userPrompt = '',
): AgenticFurnitureListResult {
  if (!isDecoratableRoom(list, userPrompt)) return list;

  const has = (re: RegExp) => list.items.some((item) => re.test(item.query));
  const extras: AgenticItemAsk[] = [];

  if (!has(/\b(area\s+)?rugs?\b|\bcarpets?\b/i)) {
    extras.push({ query: 'area rug', qty: 1, estimatedCents: 3500 });
  }
  if (!has(/\bstring\s+lights?\b|\bfairy\s+lights?\b/i)) {
    extras.push({ query: 'string lights', qty: 1, estimatedCents: 1800 });
  }
  if (!has(/\b(hanging\s+)?(leaves|ivy|garland|vines?)\b/i)) {
    extras.push({ query: 'hanging ivy leaves', qty: 1, estimatedCents: 2200 });
  }
  if (isBedroomLike(list, userPrompt) && !has(/\b(mini\s+)?fridges?\b|\brefrigerators?\b/i)) {
    extras.push({ query: 'mini fridge', qty: 1, estimatedCents: 12000 });
  }

  if (extras.length === 0) return list;
  const nextItems = [...list.items, ...extras];
  return {
    ...list,
    items: nextItems,
    estimatedTotalCents: nextItems.reduce((sum, item) => sum + (item.estimatedCents ?? 0), 0),
  };
}

function queryHasTheme(query: string, theme: string): boolean {
  return query.toLowerCase().includes(theme.toLowerCase());
}

/**
 * Named themes (Minecraft, gothic) are not in the product catalog. Write the
 * theme into decor search phrases and add the missing poster, rug, lights,
 * and bedding lines so shoppers can search for them.
 */
export function applyNamedThemeToList(
  list: AgenticFurnitureListResult,
  userPrompt = '',
): AgenticFurnitureListResult {
  const theme = shoppableTheme(list.theme);
  if (!theme) return list;
  const profile = resolveAgenticThemeProfile(theme, userPrompt || theme);
  const profilePoster = posterQueryForProfile(profile);

  const items = list.items.map((item) => {
    if (
      !theme ||
      !DECOR_QUERY.test(item.query) ||
      queryHasTheme(item.query, theme) ||
      item.query === profilePoster
    ) {
      return item;
    }
    return { ...item, query: `${theme} ${item.query}` };
  });

  const hasThemed = (re: RegExp) =>
    items.some((item) => re.test(item.query) && (theme ? queryHasTheme(item.query, theme) : true));

  const extras: AgenticItemAsk[] = [];
  if (
    !hasThemed(/\bposters?\b|\bwall art\b|\bdecals?\b/i) &&
    !items.some((item) => item.query === profilePoster)
  ) {
    extras.push({
      query: profilePoster,
      qty: 1,
      estimatedCents: 1500,
    });
  }
  if (!hasThemed(/\brugs?\b/i)) {
    extras.push({ query: `${theme} area rug`, qty: 1, estimatedCents: 3500 });
  }
  if (!hasThemed(/\blights?\b/i)) {
    extras.push({ query: `${theme} string lights`, qty: 1, estimatedCents: 1800 });
  }
  if (!hasThemed(/\bbedding\b|\bcomforter\b|\bsheets?\b|\bduvet\b/i)) {
    extras.push({ query: `${theme} bedding set`, qty: 1, estimatedCents: 4500 });
  }

  const nextItems = [...items, ...extras];
  const estimatedTotalCents = nextItems.reduce(
    (sum, item) => sum + (item.estimatedCents ?? 0),
    0,
  );

  return {
    ...list,
    items: nextItems,
    estimatedTotalCents: nextItems.some((item) => item.estimatedCents != null)
      ? estimatedTotalCents
      : list.estimatedTotalCents,
  };
}

const VIBE_IDS = new Set<AgenticVibeId>(['warm', 'neutral', 'studio', 'moody', 'sage']);

/** Shared with scripts/cursor-agentic-dev-server.mjs — keep in sync. */
export function buildCursorFurniturePrompt(userPrompt: string): string {
  return `You are a furniture and decor shopping assistant. Given a room description, produce a buyable shopping checklist with rough price estimates.

Return ONLY valid JSON. No markdown fences, no commentary, no prose before or after the JSON.

The user writes in casual, natural language — no fixed format. They may mention size, budget, theme, and must-haves in any order, or leave details out. Infer reasonable defaults for anything missing (typical dorm/bedroom size, common essentials for the room type).

Listen for themes even when casually phrased ("minecraft stuff", "dark gothic vibes", "coastal aesthetic", "anime room"). Always copy a specific named theme into the "theme" field and into decor search phrases.

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
- Each item must be a buyable furniture or decor product (queen bed, desk lamp, area rug, string lights, hanging ivy leaves, mini fridge, hangers, shelf unit, dresser, mirror, etc.)
- Dorm/bedroom lists should include decor that Toova can place in 3D: area rug, string lights, hanging ivy leaves, and mini fridge when they fit the room
- query = short search phrase you'd type into a store (e.g. "queen bed frame", "blackout curtains", "over-door hooks")
- Include commonly needed pieces for the room type and size, not only words copied from the description
- NEVER list the theme, room type, or vibe as its own item (bad: "gothic", "minecraft", "bedroom", "cozy")
- When a specific theme is named (Minecraft, gothic, coastal, etc.), put that theme in the search phrase for decor and textiles: bedding, rug, curtains, pillows, posters, string lights. Examples: "Minecraft twin XL bedding set", "Minecraft area rug", "Minecraft string lights"
- For wall posters use descriptive, trademark-free titles the Toova poster bank can match: "{theme adjective} {subject} wall poster" (good: "Gothic cathedral architecture wall poster", "Coastal beach shoreline wall poster", "Retro pixel gaming wall poster"; bad: "gothic poster", "Minecraft creeper poster")
- Include at least three theme-specific decor items. Keep structural furniture generic (bed frame, desk, chair, mattress) so a normal catalog can match it
- Every dorm/bedroom must include separate generic lines for bed frame, desk, chair, and desk lamp
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

  const base: AgenticFurnitureListResult = {
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
  return ensureRoomEssentials(applyNamedThemeToList(base), '');
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
