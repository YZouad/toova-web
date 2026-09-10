import { describe, expect, it } from 'vitest';
import {
  shouldRecordCatalogDownload,
  shouldRecordCatalogView,
} from './catalogEngagement';

const publicCommunity = {
  visibility: 'public' as const,
  userId: 'owner-1',
  isBuiltin: false,
};

describe('shouldRecordCatalogDownload', () => {
  it('skips guests — the RPC is authenticated-only', () => {
    expect(shouldRecordCatalogDownload(publicCommunity, null)).toBe(false);
    expect(shouldRecordCatalogDownload(publicCommunity, undefined)).toBe(false);
    expect(shouldRecordCatalogDownload(publicCommunity, '')).toBe(false);
  });

  it('counts a signed-in user placing someone else’s public model', () => {
    expect(shouldRecordCatalogDownload(publicCommunity, 'visitor-2')).toBe(true);
  });

  it('skips the owner placing their own model', () => {
    expect(shouldRecordCatalogDownload(publicCommunity, 'owner-1')).toBe(false);
  });

  it('skips builtins and non-public models', () => {
    expect(
      shouldRecordCatalogDownload(
        { visibility: 'public', userId: 'owner-1', isBuiltin: true },
        'visitor-2',
      ),
    ).toBe(false);
    expect(
      shouldRecordCatalogDownload(
        { visibility: 'unlisted', userId: 'owner-1', isBuiltin: false },
        'visitor-2',
      ),
    ).toBe(false);
  });
});

describe('shouldRecordCatalogView', () => {
  it('counts guests looking at a public community model', () => {
    expect(shouldRecordCatalogView(publicCommunity, null)).toBe(true);
    expect(shouldRecordCatalogView(publicCommunity, undefined)).toBe(true);
  });

  it('counts a signed-in visitor', () => {
    expect(shouldRecordCatalogView(publicCommunity, 'visitor-2')).toBe(true);
  });

  it('skips the owner', () => {
    expect(shouldRecordCatalogView(publicCommunity, 'owner-1')).toBe(false);
  });

  it('skips builtins and non-public models', () => {
    expect(
      shouldRecordCatalogView(
        { visibility: 'public', userId: 'owner-1', isBuiltin: true },
        'visitor-2',
      ),
    ).toBe(false);
    expect(
      shouldRecordCatalogView(
        { visibility: 'unlisted', userId: 'owner-1', isBuiltin: false },
        'visitor-2',
      ),
    ).toBe(false);
    expect(
      shouldRecordCatalogView(
        { visibility: 'private', userId: 'owner-1', isBuiltin: false },
        'visitor-2',
      ),
    ).toBe(false);
  });
});
