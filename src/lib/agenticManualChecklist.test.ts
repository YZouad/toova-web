import { describe, expect, it } from 'vitest';
import {
  createManualChecklistResult,
  mergeAiSuggestionsIntoList,
} from './agenticManualChecklist';
import type { AgenticFurnitureListResult } from './agenticRoomListTypes';

describe('agenticManualChecklist', () => {
  it('creates a manual checklist with dorm essentials', () => {
    const list = createManualChecklistResult();
    expect(list.source).toBe('manual');
    const queries = list.items.map((item) => item.query.toLowerCase());
    expect(queries.some((q) => /\bdesk\b/.test(q))).toBe(true);
    expect(queries.some((q) => /\bchair\b/.test(q))).toBe(true);
    expect(queries.some((q) => /\blamp\b/.test(q))).toBe(true);
    expect(queries.some((q) => /\bfridge\b/.test(q))).toBe(true);
    expect(queries.some((q) => /\bmirror\b/.test(q))).toBe(true);
  });

  it('merges AI suggestions without duplicating existing queries', () => {
    const current: AgenticFurnitureListResult = {
      items: [
        { query: 'desk', qty: 1 },
        { query: 'chair', qty: 1 },
      ],
      warnings: [],
      source: 'manual',
    };
    const suggested: AgenticFurnitureListResult = {
      items: [
        { query: 'desk', qty: 1 },
        { query: 'dresser', qty: 1 },
        { query: 'mirror', qty: 1 },
      ],
      theme: 'gothic',
      warnings: [],
      source: 'cursor',
    };
    const merged = mergeAiSuggestionsIntoList(current, suggested);
    expect(merged.items.map((item) => item.query)).toEqual(['desk', 'chair', 'dresser', 'mirror']);
    expect(merged.theme).toBe('gothic');
  });
});
