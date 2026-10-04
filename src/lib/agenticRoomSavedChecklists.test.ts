import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SAVED_AGENTIC_CHECKLISTS_KEY,
  MAX_SAVED_AGENTIC_CHECKLISTS,
  applySavedResolvedPicks,
  buildAgenticChecklistDraft,
  deleteAgenticChecklistDraft,
  loadSavedAgenticChecklists,
  saveAgenticChecklistDraft,
  type SavedAgenticChecklistDraft,
} from './agenticRoomSavedChecklists';

describe('agenticRoomSavedChecklists', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => {
          storage[k] = v;
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
        clear: () => {
          storage = {};
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  const sampleDraft = (id: string, title: string, updatedAt: string): SavedAgenticChecklistDraft => ({
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    prompt: '12x10 dorm',
    listResult: {
      items: [{ query: 'bed', qty: 1 }],
      warnings: [],
      source: 'cursor',
    },
    items: [{ query: 'bed', qty: 1 }],
  });

  it('returns empty when storage is missing', () => {
    expect(loadSavedAgenticChecklists()).toEqual([]);
  });

  it('returns empty on invalid JSON', () => {
    storage[SAVED_AGENTIC_CHECKLISTS_KEY] = '{not json';
    expect(loadSavedAgenticChecklists()).toEqual([]);
  });

  it('saves and loads a draft', () => {
    const draft = sampleDraft('d1', 'Gothic dorm', '2026-09-30T12:00:00.000Z');
    saveAgenticChecklistDraft(draft);
    const loaded = loadSavedAgenticChecklists();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('Gothic dorm');
  });

  it('upserts by id', () => {
    saveAgenticChecklistDraft(sampleDraft('d1', 'First', '2026-09-30T10:00:00.000Z'));
    saveAgenticChecklistDraft({
      ...sampleDraft('d1', 'Updated', '2026-09-30T12:00:00.000Z'),
      createdAt: '2026-09-30T10:00:00.000Z',
    });
    const loaded = loadSavedAgenticChecklists();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('Updated');
  });

  it('deletes a draft', () => {
    saveAgenticChecklistDraft(sampleDraft('d1', 'One', '2026-09-30T12:00:00.000Z'));
    saveAgenticChecklistDraft(sampleDraft('d2', 'Two', '2026-09-30T11:00:00.000Z'));
    deleteAgenticChecklistDraft('d1');
    const loaded = loadSavedAgenticChecklists();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('d2');
  });

  it('caps at MAX_SAVED_AGENTIC_CHECKLISTS', () => {
    for (let i = 0; i < MAX_SAVED_AGENTIC_CHECKLISTS + 5; i++) {
      saveAgenticChecklistDraft(
        sampleDraft(`d${i}`, `Draft ${i}`, `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`),
      );
    }
    expect(loadSavedAgenticChecklists()).toHaveLength(MAX_SAVED_AGENTIC_CHECKLISTS);
  });

  it('buildAgenticChecklistDraft includes resolved picks', () => {
    const draft = buildAgenticChecklistDraft({
      title: 'Test',
      prompt: 'dorm',
      listResult: { items: [{ query: 'desk', qty: 1 }], warnings: [], source: 'cursor' },
      items: [{ query: 'desk', qty: 1 }],
      resolved: [
        {
          query: 'desk',
          qty: 1,
          product: {
            id: 'p-desk',
            categoryId: 'c',
            slug: 'desk',
            name: 'Desk',
            description: '',
            retailer: 'Amazon',
            affiliateUrl: 'https://example.com',
            priceCents: 10000,
            currency: 'USD',
            imagePath: null,
            imageUrl: null,
            sortOrder: 0,
            published: true,
            lastVerifiedAt: null,
            placeBuiltinKind: 'desk',
            placeCatalogKind: null,
            placeHangingKind: null,
            placeBeddingKind: null,
            brand: null,
            featureBullets: [],
            dimensionsText: null,
            rating: null,
            reviewCount: null,
            availability: null,
          },
          alternates: [],
          score: 100,
          builtinKind: null,
          warnings: [],
          searchOffers: [],
          placeInRoom: true,
          communityModel: null,
          bankPoster: null,
        },
      ],
    });
    expect(draft.resolved?.[0]?.productId).toBe('p-desk');
  });

  it('applySavedResolvedPicks restores catalog product by id', () => {
    const product = {
      id: 'p-desk',
      categoryId: 'c',
      slug: 'desk',
      name: 'Desk',
      description: '',
      retailer: 'Amazon',
      affiliateUrl: 'https://example.com',
      priceCents: 10000,
      currency: 'USD',
      imagePath: null,
      imageUrl: null,
      sortOrder: 0,
      published: true,
      lastVerifiedAt: null,
      placeBuiltinKind: 'desk',
      placeCatalogKind: null,
      placeHangingKind: null,
      placeBeddingKind: null,
      brand: null,
      featureBullets: [],
      dimensionsText: null,
      rating: null,
      reviewCount: null,
      availability: null,
    };
    const items = [
      {
        query: 'desk',
        qty: 1,
        product: null,
        alternates: [],
        score: 0,
        builtinKind: null,
        warnings: [],
        searchOffers: [],
        placeInRoom: true,
        communityModel: null,
        bankPoster: null,
      },
    ];
    const restored = applySavedResolvedPicks(
      items,
      [{ query: 'desk', qty: 2, productId: 'p-desk' }],
      [product],
    );
    expect(restored[0]?.qty).toBe(2);
    expect(restored[0]?.product?.id).toBe('p-desk');
  });

  it('save as new keeps two drafts after reload', () => {
    saveAgenticChecklistDraft(sampleDraft('d1', 'Gothic dorm', '2026-09-30T12:00:00.000Z'));
    saveAgenticChecklistDraft(sampleDraft('d2', 'Minimal studio', '2026-09-30T11:00:00.000Z'));
    const reloaded = loadSavedAgenticChecklists();
    expect(reloaded).toHaveLength(2);
    expect(reloaded.map((d) => d.title).sort()).toEqual(['Gothic dorm', 'Minimal studio']);
  });
});
