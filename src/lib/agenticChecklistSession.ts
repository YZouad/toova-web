import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import type { AgenticItemAsk } from './agenticRoomPrompt';
import type { AgenticReviewRow } from './agenticRoomResolveFromList';
import type {
  SavedAgenticCommunityModel,
  SavedAgenticResolvedPick,
} from './agenticRoomSavedChecklists';

export const AGENTIC_CHECKLIST_SESSION_KEY = 'toova-agentic-checklist-session';
export const AGENTIC_CHECKLIST_PICKS_KEY = 'toova-agentic-checklist-pending-picks';
export const AGENTIC_CHECKLIST_PICK_MODE_KEY = 'toova-agentic-checklist-pick-mode';
export const AGENTIC_CHECKLIST_RESUME_KEY = 'toova-agentic-checklist-resume';

export interface AgenticChecklistSession {
  prompt: string;
  result: AgenticFurnitureListResult | null;
  items: AgenticItemAsk[];
  savedPicks?: SavedAgenticResolvedPick[];
  activeDraftId?: string | null;
  saveTitle?: string;
  itemResolutions?: Array<[number, 'have' | 'skip']>;
}

export interface AgenticChecklistPendingPick {
  query: string;
  communityModel: SavedAgenticCommunityModel;
}

export interface AgenticChecklistPickMode {
  returnPath: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

export function saveAgenticChecklistSession(session: AgenticChecklistSession): void {
  writeJson(AGENTIC_CHECKLIST_SESSION_KEY, session);
}

export function loadAgenticChecklistSession(): AgenticChecklistSession | null {
  return readJson<AgenticChecklistSession>(AGENTIC_CHECKLIST_SESSION_KEY);
}

export function clearAgenticChecklistSession(): void {
  sessionStorage.removeItem(AGENTIC_CHECKLIST_SESSION_KEY);
  sessionStorage.removeItem(AGENTIC_CHECKLIST_PICKS_KEY);
  sessionStorage.removeItem(AGENTIC_CHECKLIST_PICK_MODE_KEY);
}

export function setAgenticChecklistPickMode(mode: AgenticChecklistPickMode): void {
  writeJson(AGENTIC_CHECKLIST_PICK_MODE_KEY, mode);
}

export function getAgenticChecklistPickMode(): AgenticChecklistPickMode | null {
  return readJson<AgenticChecklistPickMode>(AGENTIC_CHECKLIST_PICK_MODE_KEY);
}

export function clearAgenticChecklistPickMode(): void {
  sessionStorage.removeItem(AGENTIC_CHECKLIST_PICK_MODE_KEY);
}

export function appendAgenticChecklistPick(pick: AgenticChecklistPendingPick): void {
  const prev = readJson<AgenticChecklistPendingPick[]>(AGENTIC_CHECKLIST_PICKS_KEY) ?? [];
  writeJson(AGENTIC_CHECKLIST_PICKS_KEY, [...prev, pick]);
}

export function drainAgenticChecklistPicks(): AgenticChecklistPendingPick[] {
  const picks = readJson<AgenticChecklistPendingPick[]>(AGENTIC_CHECKLIST_PICKS_KEY) ?? [];
  sessionStorage.removeItem(AGENTIC_CHECKLIST_PICKS_KEY);
  return picks;
}

export function markAgenticChecklistResume(): void {
  sessionStorage.setItem(AGENTIC_CHECKLIST_RESUME_KEY, '1');
}

export function consumeAgenticChecklistResume(): boolean {
  const pending = sessionStorage.getItem(AGENTIC_CHECKLIST_RESUME_KEY) === '1';
  sessionStorage.removeItem(AGENTIC_CHECKLIST_RESUME_KEY);
  return pending;
}

export function resolvedRowsToSavedPicks(rows: AgenticReviewRow[]): SavedAgenticResolvedPick[] {
  return rows.map((row) => ({
    query: row.query,
    qty: row.qty,
    productId: row.product?.id ?? null,
    placeInRoom: row.placeInRoom,
    communityModel: row.communityModel
      ? {
          kind: row.communityModel.kind,
          label: row.communityModel.label,
          modelUrl: row.communityModel.modelUrl,
          widthIn: row.communityModel.widthIn,
          heightIn: row.communityModel.heightIn,
          depthIn: row.communityModel.depthIn,
        }
      : row.communityModel === null
        ? null
        : undefined,
  }));
}

export function galleryModelToCommunityPick(model: {
  kind: string;
  label: string;
  storagePath: string;
  signedUrl: string | null;
  width_in: number;
  height_in: number;
  depth_in: number;
}): AgenticChecklistPendingPick {
  const query = model.label.trim() || model.kind;
  return {
    query,
    communityModel: {
      kind: model.kind,
      label: query,
      modelUrl: model.storagePath.trim() || model.signedUrl,
      widthIn: model.width_in,
      heightIn: model.height_in,
      depthIn: model.depth_in,
    },
  };
}

/** Merge gallery picks into a restored checklist session. */
export function mergePendingPicksIntoSession(
  session: AgenticChecklistSession,
  picks: AgenticChecklistPendingPick[],
): AgenticChecklistSession {
  if (picks.length === 0) return session;

  const items = [...session.items];
  const savedPicks = [...(session.savedPicks ?? [])];
  const existingQueries = new Set(
    items.map((item) => item.query.trim().toLowerCase()).filter(Boolean),
  );

  for (const pick of picks) {
    const query = pick.query.trim();
    if (!query) continue;

    if (!existingQueries.has(query.toLowerCase())) {
      items.push({ query, qty: 1 });
      existingQueries.add(query.toLowerCase());
    }

    const pickIndex = savedPicks.findIndex(
      (row) => row.query.trim().toLowerCase() === query.toLowerCase(),
    );
    const resolvedPick: SavedAgenticResolvedPick = {
      query,
      qty: 1,
      productId: null,
      placeInRoom: true,
      communityModel: pick.communityModel,
    };
    if (pickIndex >= 0) {
      savedPicks[pickIndex] = { ...savedPicks[pickIndex]!, ...resolvedPick };
    } else {
      savedPicks.push(resolvedPick);
    }
  }

  const result = session.result
    ? { ...session.result, items }
    : {
        items,
        warnings: [],
        source: 'manual' as const,
      };

  return { ...session, items, result, savedPicks };
}
