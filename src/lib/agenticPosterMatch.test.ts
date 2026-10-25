import { describe, expect, it } from 'vitest';
import { isPosterDecorQuery, resolveAgenticPoster } from './agenticPosterMatch';

describe('agenticPosterMatch', () => {
  it('detects poster decor queries', () => {
    expect(isPosterDecorQuery('gothic wall poster')).toBe(true);
    expect(isPosterDecorQuery('queen bed frame')).toBe(false);
  });

  it('matches gothic dorm wall poster to gothic cathedral bank entry', () => {
    const match = resolveAgenticPoster('gothic dorm wall poster', 'gothic');
    expect(match?.kind).toBe('poster-gothic-cathedral');
    expect(match?.modelUrl).toContain('poster-gothic-cathedral.glb');
  });

  it('matches coastal beach poster to coastal bank entry', () => {
    const match = resolveAgenticPoster('coastal beach wall poster', 'coastal');
    expect(match?.kind).toBe('poster-coastal-beach');
  });

  it('matches minecraft theme to retro pixel gaming poster', () => {
    const match = resolveAgenticPoster('minecraft wall poster', 'minecraft');
    expect(match?.kind).toBe('poster-pixel-blocks');
  });

  it('returns null for non-poster furniture queries', () => {
    expect(resolveAgenticPoster('queen bed frame', 'gothic')).toBeNull();
  });
});
