import { describe, expect, it } from 'vitest';
import {
  encodeCanonicalStorageKey,
  isCanonicalStorageKey,
  isOwnedStorageKey,
} from './storageObjectKey';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('storage object keys', () => {
  it('accepts an owner-scoped key', () => {
    const path = `${OWNER}/room/file.jpg`;
    expect(isCanonicalStorageKey(path)).toBe(true);
    expect(isOwnedStorageKey(path, OWNER)).toBe(true);
    expect(encodeCanonicalStorageKey(path)).toBe(`${OWNER}/room/file.jpg`);
  });

  it('rejects dot segments that would leave the bucket', () => {
    const path = `${OWNER}/../../model-files/${OTHER}/secret.glb`;
    expect(isCanonicalStorageKey(path)).toBe(false);
    expect(isOwnedStorageKey(path, OWNER)).toBe(false);
    expect(encodeCanonicalStorageKey(path)).toBeNull();
  });

  it('rejects another user folder, schemes, and static repo paths', () => {
    expect(isOwnedStorageKey(`${OTHER}/a.jpg`, OWNER)).toBe(false);
    expect(isCanonicalStorageKey('https://evil.example/a.jpg')).toBe(false);
    expect(isCanonicalStorageKey('checklist-refs/glb/desk.glb')).toBe(false);
    expect(isCanonicalStorageKey(`${OWNER}/../${OTHER}/a.jpg`)).toBe(false);
    expect(encodeCanonicalStorageKey(`${OWNER}/../${OTHER}/a.jpg`)).toBeNull();
  });
});
