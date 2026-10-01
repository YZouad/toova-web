import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticItemAsk, AgenticVibeId } from './agenticRoomPrompt';
import type { CuratedProduct } from './dormChecklist';
import type { ResolvedAgenticItemWithOffers } from './agenticRoomResolveFromList';
import { searchOffersForQuery } from './affiliateLinks';

export const SAVED_AGENTIC_CHECKLISTS_KEY = 'toova-agentic-checklist-drafts';
export const MAX_SAVED_AGENTIC_CHECKLISTS = 30;

export interface SavedAgenticResolvedPick {
  query: string;
  qty: number;
  productId: string | null;
}

export interface SavedAgenticChecklistDraft {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  listResult: AgenticFurnitureListResult | null;
  items: AgenticItemAsk[];
  resolved?: SavedAgenticResolvedPick[];
}

const VIBE_IDS = new Set<AgenticVibeId>(['warm', 'neutral', 'studio', 'moody', 'sage']);

function parseItem(raw: unknown): AgenticItemAsk | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const query = typeof o.query === 'string' ? o.query.trim() : '';
  if (!query) return null;
  const qty =
    typeof o.qty === 'number' && Number.isFinite(o.qty) && o.qty > 0
      ? Math.floor(o.qty)
      : 1;
  const estimatedCents =
    typeof o.estimatedCents === 'number' && Number.isFinite(o.estimatedCents) && o.estimatedCents >= 0
      ? Math.round(o.estimatedCents)
      : undefined;
  return estimatedCents != null ? { query, qty, estimatedCents } : { query, qty };
}

function parseListResult(raw: unknown): AgenticFurnitureListResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items = itemsRaw.map(parseItem).filter((x): x is AgenticItemAsk => x != null);
  if (items.length === 0) return null;

  const vibeRaw = o.vibe;
  const vibe =
    typeof vibeRaw === 'string' && VIBE_IDS.has(vibeRaw as AgenticVibeId)
      ? (vibeRaw as AgenticVibeId)
      : undefined;

  const warnings = Array.isArray(o.warnings)
    ? o.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  const source = o.source === 'cursor' || o.source === 'rules-fallback' ? o.source : 'cursor';

  return {
    items,
    widthIn: typeof o.widthIn === 'number' && o.widthIn > 0 ? o.widthIn : undefined,
    depthIn: typeof o.depthIn === 'number' && o.depthIn > 0 ? o.depthIn : undefined,
    budgetCents:
      typeof o.budgetCents === 'number' && o.budgetCents > 0 ? o.budgetCents : undefined,
    roomType: typeof o.roomType === 'string' && o.roomType.trim() ? o.roomType.trim() : undefined,
    theme: typeof o.theme === 'string' && o.theme.trim() ? o.theme.trim() : undefined,
    vibe,
    estimatedTotalCents:
      typeof o.estimatedTotalCents === 'number' && o.estimatedTotalCents >= 0
        ? o.estimatedTotalCents
        : undefined,
    warnings,
    source,
  };
}

function parseResolvedPick(raw: unknown): SavedAgenticResolvedPick | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const query = typeof o.query === 'string' ? o.query.trim() : '';
  if (!query) return null;
  const qty =
    typeof o.qty === 'number' && Number.isFinite(o.qty) && o.qty > 0
      ? Math.floor(o.qty)
      : 1;
  const productId =
    typeof o.productId === 'string' && o.productId.trim() ? o.productId.trim() : null;
  return { query, qty, productId };
}

function parseDraft(raw: unknown): SavedAgenticChecklistDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return null;
  if (typeof o.title !== 'string' || !o.title.trim()) return null;
  if (typeof o.createdAt !== 'string' || typeof o.updatedAt !== 'string') return null;
  if (typeof o.prompt !== 'string') return null;

  const itemsRaw = o.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items = itemsRaw.map(parseItem).filter((x): x is AgenticItemAsk => x != null);
  if (items.length === 0) return null;

  const listResult = o.listResult != null ? parseListResult(o.listResult) : null;
  const resolved = Array.isArray(o.resolved)
    ? o.resolved.map(parseResolvedPick).filter((x): x is SavedAgenticResolvedPick => x != null)
    : undefined;

  return {
    id: o.id.trim(),
    title: o.title.trim(),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    prompt: o.prompt,
    listResult,
    items,
    resolved: resolved?.length ? resolved : undefined,
  };
}

function readAll(): SavedAgenticChecklistDraft[] {
  try {
    const raw = localStorage.getItem(SAVED_AGENTIC_CHECKLISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseDraft)
      .filter((x): x is SavedAgenticChecklistDraft => x != null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeAll(drafts: SavedAgenticChecklistDraft[]): SavedAgenticChecklistDraft[] {
  const sorted = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const capped = sorted.slice(0, MAX_SAVED_AGENTIC_CHECKLISTS);
  try {
    localStorage.setItem(SAVED_AGENTIC_CHECKLISTS_KEY, JSON.stringify(capped));
  } catch {
    /* ignore quota */
  }
  return capped;
}

export function loadSavedAgenticChecklists(): SavedAgenticChecklistDraft[] {
  return readAll();
}

export function deleteAgenticChecklistDraft(id: string): SavedAgenticChecklistDraft[] {
  return writeAll(readAll().filter((d) => d.id !== id));
}

export function saveAgenticChecklistDraft(
  draft: SavedAgenticChecklistDraft,
): SavedAgenticChecklistDraft[] {
  const existing = readAll();
  const idx = existing.findIndex((d) => d.id === draft.id);
  const next =
    idx >= 0
      ? existing.map((d, i) => (i === idx ? draft : d))
      : [draft, ...existing];
  return writeAll(next);
}

export function defaultChecklistTitle(
  prompt: string,
  listResult: AgenticFurnitureListResult | null,
): string {
  if (listResult?.roomType?.trim()) return listResult.roomType.trim();
  const trimmed = prompt.trim();
  if (!trimmed) return 'My checklist';
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
}

export function buildAgenticChecklistDraft(input: {
  title: string;
  id?: string | null;
  createdAt?: string;
  prompt: string;
  listResult: AgenticFurnitureListResult | null;
  items: AgenticItemAsk[];
  resolved: ResolvedAgenticItemWithOffers[];
}): SavedAgenticChecklistDraft {
  const now = new Date().toISOString();
  const id = input.id?.trim() || crypto.randomUUID();
  return {
    id,
    title: input.title.trim(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    prompt: input.prompt,
    listResult: input.listResult,
    items: input.items,
    resolved: input.resolved.map((row) => ({
      query: row.query,
      qty: row.qty,
      productId: row.product?.id ?? null,
    })),
  };
}

/** Re-apply stored catalog product picks after resolveAgenticList runs. */
export function applySavedResolvedPicks(
  items: ResolvedAgenticItemWithOffers[],
  picks: SavedAgenticResolvedPick[] | undefined,
  products: CuratedProduct[],
): ResolvedAgenticItemWithOffers[] {
  if (!picks?.length) return items;

  const pickByQuery = new Map(picks.map((p) => [p.query.trim().toLowerCase(), p]));

  return items.map((item) => {
    const pick = pickByQuery.get(item.query.trim().toLowerCase());
    if (!pick) return item;

    const qty = pick.qty;
    if (!pick.productId) {
      return { ...item, qty };
    }

    const product = products.find((p) => p.id === pick.productId);
    if (!product) {
      return { ...item, qty };
    }

    return {
      ...item,
      qty,
      product,
      builtinKind: null,
      warnings: [],
      searchOffers: product.affiliateUrl?.trim() ? [] : searchOffersForQuery(item.query),
    };
  });
}

export function formatSavedChecklistDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
