import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticItemAsk } from './agenticRoomPrompt';
import { inches } from '../units';
import { ensureCatalogBankExtras, ensureDeskPairings, ensureRoomEssentials } from './agenticRoomParseJson';

/** Common dorm/bedroom lines users can edit, remove, or pair with community models. */
export const MANUAL_CHECKLIST_STARTER_ITEMS: AgenticItemAsk[] = [
  { query: 'twin bed frame', qty: 1 },
  { query: 'desk', qty: 1 },
  { query: 'chair', qty: 1 },
  { query: 'desk lamp', qty: 1 },
  { query: 'area rug', qty: 1 },
  { query: 'string lights', qty: 1 },
  { query: 'mini fridge', qty: 1 },
  { query: 'full length mirror', qty: 1 },
];

export function createManualChecklistResult(
  items: AgenticItemAsk[] = MANUAL_CHECKLIST_STARTER_ITEMS,
): AgenticFurnitureListResult {
  const base: AgenticFurnitureListResult = {
    items: items.map((item) => ({ ...item })),
    widthIn: inches(10),
    depthIn: inches(12),
    roomType: 'dorm bedroom',
    warnings: [],
    source: 'manual',
  };
  return ensureCatalogBankExtras(
    ensureDeskPairings(ensureRoomEssentials(base, base.roomType ?? ''), base.roomType ?? ''),
    base.roomType ?? '',
  );
}

function normalizeQueryKey(query: string): string {
  return query.trim().toLowerCase();
}

/** Add AI-suggested lines that are not already on the checklist (by query text). */
export function mergeAiSuggestionsIntoList(
  current: AgenticFurnitureListResult,
  suggested: AgenticFurnitureListResult,
): AgenticFurnitureListResult {
  const existing = new Set(current.items.map((item) => normalizeQueryKey(item.query)).filter(Boolean));
  const extras = suggested.items.filter((item) => {
    const key = normalizeQueryKey(item.query);
    return key.length > 0 && !existing.has(key);
  });

  const nextItems = [...current.items, ...extras];
  const estimatedTotalCents = nextItems.reduce(
    (sum, item) => sum + (item.estimatedCents ?? 0),
    0,
  );

  return {
    ...current,
    widthIn: current.widthIn ?? suggested.widthIn,
    depthIn: current.depthIn ?? suggested.depthIn,
    budgetCents: current.budgetCents ?? suggested.budgetCents,
    roomType: current.roomType ?? suggested.roomType,
    theme: current.theme ?? suggested.theme,
    vibe: current.vibe ?? suggested.vibe,
    colorScheme: current.colorScheme ?? suggested.colorScheme,
    windowCurtains: current.windowCurtains ?? suggested.windowCurtains,
    items: nextItems,
    estimatedTotalCents: nextItems.some((item) => item.estimatedCents != null)
      ? estimatedTotalCents
      : current.estimatedTotalCents,
    warnings: [...current.warnings, ...suggested.warnings],
  };
}
