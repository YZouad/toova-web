import { describe, expect, it } from 'vitest';
import { parsePathname } from '../../hooks/useRoute';
import { getSeoArticle, listSeoArticlePaths } from '../../content';
import { getSeoRoute, listSeoPaths, SEO_ROUTES } from './routes';

describe('SEO routes', () => {
  it('registers home and pillar pages', () => {
    expect(getSeoRoute('/')?.canonical).toBe('https://toova.net/');
    expect(getSeoRoute('/room-designer/')?.title).toMatch(/Room Designer/i);
    expect(getSeoRoute('/pricing/')?.canonical).toBe('https://toova.net/pricing/');
  });

  it('includes trailing-slash paths only in the path list', () => {
    for (const path of listSeoPaths()) {
      if (path !== '/') expect(path.endsWith('/')).toBe(true);
    }
  });

  it('maps article paths through the router', () => {
    expect(parsePathname('/room-designer')).toEqual({
      name: 'seoPage',
      path: '/room-designer/',
    });
    expect(parsePathname('/dorms/uchicago/woodlawn/single/')).toEqual({
      name: 'seoPage',
      path: '/dorms/uchicago/woodlawn/single/',
    });
    expect(parsePathname('/compare/planner-5d')).toEqual({
      name: 'seoPage',
      path: '/compare/planner-5d/',
    });
  });

  it('has an article for every dorm starter path', () => {
    const paths = listSeoArticlePaths();
    expect(paths).toContain('/dorms/uchicago/');
    expect(paths.some((p) => p.includes('woodlawn'))).toBe(true);
    expect(getSeoArticle('/dorms/uchicago/woodlawn/double/')?.cta?.href).toContain(
      'template=uchicago-woodlawn-double',
    );
  });

  it('keeps unique paths in the registry', () => {
    const seen = new Set<string>();
    for (const route of SEO_ROUTES) {
      expect(seen.has(route.path)).toBe(false);
      seen.add(route.path);
    }
  });
});
