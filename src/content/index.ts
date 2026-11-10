import { COMPARE_ARTICLES } from './compare';
import { UCHICAGO_DESIGN_ARTICLE, UCHICAGO_DORM_ARTICLES, UCHICAGO_HUB_ARTICLE } from './dorms';
import { GUIDE_ARTICLES } from './guides';
import { PILLAR_ARTICLES } from './pillars';
import type { SeoArticle } from './types';
import { withTrailingSlash } from '../lib/seo/site';

export type { SeoArticle, SeoArticleSection, SeoArticleCta } from './types';

/** All indexable marketing articles (pillars, dorms, comparisons, guides). */
export const SEO_ARTICLES: SeoArticle[] = [
  ...PILLAR_ARTICLES,
  UCHICAGO_HUB_ARTICLE,
  UCHICAGO_DESIGN_ARTICLE,
  ...UCHICAGO_DORM_ARTICLES,
  ...COMPARE_ARTICLES,
  ...GUIDE_ARTICLES,
];

const byPath = new Map<string, SeoArticle>();
for (const article of SEO_ARTICLES) {
  byPath.set(withTrailingSlash(article.path), article);
  const noSlash = article.path.replace(/\/+$/, '') || '/';
  if (noSlash !== withTrailingSlash(article.path)) {
    byPath.set(noSlash, article);
  }
}

export function getSeoArticle(path: string): SeoArticle | undefined {
  const normalized = path === '/' ? '/' : withTrailingSlash(path);
  return byPath.get(normalized) ?? byPath.get(path.replace(/\/+$/, '') || '/');
}

export function listSeoArticlePaths(): string[] {
  return SEO_ARTICLES.map((a) => withTrailingSlash(a.path));
}
