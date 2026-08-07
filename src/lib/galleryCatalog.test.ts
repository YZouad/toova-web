import { describe, expect, it } from 'vitest';
import {
  containsBannedWords,
  normalizeForProfanity,
  validateCatalogText,
  BANNED_LANGUAGE_MESSAGE,
} from './bannedWords';
import {
  normalizeCatalogCategories,
  toggleCatalogCategory,
  MAX_CATALOG_CATEGORIES,
} from './catalogCategories';
import {
  buildGallerySearchParams,
  catalogHotScore,
  parseGallerySearchParams,
} from './galleryCatalogHelpers';
import { roomHotScore } from './roomGalleryHelpers';
import { parsePathname, galleryPath } from '../hooks/useRoute';

describe('bannedWords', () => {
  it('normalizes obfuscation', () => {
    expect(normalizeForProfanity('s.h.i.t')).toBe('shit');
    expect(normalizeForProfanity('F_U_C_K')).toBe('fuck');
  });

  it('detects banned words case-insensitively', () => {
    expect(containsBannedWords('This is Shit')).toBe(true);
    expect(containsBannedWords('nice chair')).toBe(false);
  });

  it('validates catalog fields without echoing matches', () => {
    expect(validateCatalogText({ label: 'fuck chair' })).toBe(BANNED_LANGUAGE_MESSAGE);
    expect(validateCatalogText({ description: 'damn nice' })).toBe(BANNED_LANGUAGE_MESSAGE);
    expect(validateCatalogText({ label: 'Armchair', description: 'Oak' })).toBeNull();
  });
});

describe('catalogCategories', () => {
  it('normalizes and caps at three', () => {
    expect(normalizeCatalogCategories(['Seating', 'beds', 'seating'])).toEqual([
      'seating',
      'beds',
    ]);
    expect(() =>
      normalizeCatalogCategories(['seating', 'beds', 'tables', 'rugs']),
    ).toThrow(/up to 3/i);
  });

  it('toggles without exceeding max', () => {
    const a = toggleCatalogCategory([], 'seating');
    const b = toggleCatalogCategory(a, 'beds');
    const c = toggleCatalogCategory(b, 'tables');
    expect(c).toHaveLength(MAX_CATALOG_CATEGORIES);
    expect(toggleCatalogCategory(c, 'rugs')).toEqual(c);
    expect(toggleCatalogCategory(c, 'beds')).toEqual(['seating', 'tables']);
  });
});

describe('galleryCatalog helpers', () => {
  it('parses and builds search params', () => {
    const parsed = parseGallerySearchParams(
      '?source=toova&sort=downloads&category=lighting&q=lamp',
    );
    expect(parsed).toEqual({
      mode: 'models',
      source: 'toova',
      sort: 'downloads',
      roomSort: 'clones',
      categories: ['lighting'],
      query: 'lamp',
    });
    expect(
      parseGallerySearchParams('?mode=models&category=seating,outdoor'),
    ).toMatchObject({
      categories: ['seating', 'outdoor'],
    });
    expect(
      buildGallerySearchParams({
        mode: 'discover',
        source: 'community',
        sort: 'hot',
        categories: [],
        query: '',
      }),
    ).toBe('');
    expect(
      buildGallerySearchParams({
        mode: 'models',
        source: 'mine',
        sort: 'newest',
        categories: ['beds'],
        query: 'twin',
      }),
    ).toBe('?mode=models&source=mine&category=beds&q=twin');
    expect(
      buildGallerySearchParams({
        mode: 'models',
        categories: ['seating', 'outdoor'],
        query: '',
      }),
    ).toBe('?mode=models&category=seating%2Coutdoor');
    expect(
      buildGallerySearchParams({
        mode: 'rooms',
        roomSort: 'clones',
        query: '',
      }),
    ).toBe('?mode=rooms&roomSort=clones');
  });

  it('defaults bare /gallery to discover', () => {
    expect(parseGallerySearchParams('')).toEqual({
      mode: 'discover',
      source: 'community',
      sort: 'hot',
      roomSort: 'hot',
      categories: [],
      query: '',
    });
  });

  it('computes hot score with age decay', () => {
    const now = new Date('2026-08-05T00:00:00Z');
    const fresh = catalogHotScore({
      likes: 10,
      downloads: 5,
      views: 100,
      createdAt: '2026-08-04T00:00:00Z',
      now,
    });
    const old = catalogHotScore({
      likes: 10,
      downloads: 5,
      views: 100,
      createdAt: '2025-01-01T00:00:00Z',
      now,
    });
    expect(fresh).toBeGreaterThan(old);
  });
  it('computes room hot score with age decay', () => {
    const now = new Date('2026-08-05T00:00:00Z');
    const fresh = roomHotScore({
      likes: 10,
      forks: 5,
      views: 100,
      publishedAt: '2026-08-04T00:00:00Z',
      now,
    });
    const old = roomHotScore({
      likes: 10,
      forks: 5,
      views: 100,
      publishedAt: '2025-01-01T00:00:00Z',
      now,
    });
    expect(fresh).toBeGreaterThan(old);
  });
});

describe('parsePathname gallery', () => {
  it('recognizes /gallery', () => {
    expect(parsePathname('/gallery')).toEqual({ name: 'gallery' });
    expect(parsePathname('/gallery/')).toEqual({ name: 'gallery' });
    expect(galleryPath('?source=toova')).toBe('/gallery?source=toova');
  });
});
