import type { SeoFaqItem } from '../lib/seo/facts';

export interface SeoArticleSection {
  heading: string;
  body: string[];
}

export interface SeoArticleCta {
  label: string;
  /** Path or query deep-link, e.g. / or /?template=uchicago-woodlawn-single */
  href: string;
}

export interface SeoArticle {
  /** Path without domain, trailing slash preferred for multi-segment; `/` for home is not an article. */
  path: string;
  title: string;
  description: string;
  /** Visible H1 */
  heading: string;
  /** One-line lead under the H1 */
  lead: string;
  sections: SeoArticleSection[];
  faq?: SeoFaqItem[];
  cta?: SeoArticleCta;
  /** Sitemap priority 0–1 */
  priority?: number;
  breadcrumbs: { name: string; path: string }[];
}
