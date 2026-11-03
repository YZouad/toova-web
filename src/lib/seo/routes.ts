import { SEO_ARTICLES } from '../../content';
import {
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from './facts';
import { articleJsonLdGraph, homeJsonLdGraph } from './jsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE, withTrailingSlash } from './site';

export interface SeoRouteMeta {
  path: string;
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  priority: number;
  /** JSON-LD object (will be stringified into a script tag). */
  jsonLd: Record<string, unknown>;
  /** noindex for auth/reset etc. — marketing routes are indexable */
  noindex?: boolean;
}

function articleToMeta(article: {
  path: string;
  title: string;
  description: string;
  priority?: number;
  breadcrumbs: { name: string; path: string }[];
  faq?: { question: string; answer: string }[];
}): SeoRouteMeta {
  const path = withTrailingSlash(article.path);
  return {
    path,
    title: article.title,
    description: article.description,
    canonical: absoluteUrl(path),
    ogImage: DEFAULT_OG_IMAGE,
    priority: article.priority ?? 0.6,
    jsonLd: articleJsonLdGraph({
      path,
      title: article.title,
      description: article.description,
      breadcrumbs: article.breadcrumbs,
      faq: article.faq,
    }),
  };
}

const HOME: SeoRouteMeta = {
  path: '/',
  title: `${PRODUCT_NAME} – ${PRODUCT_TAGLINE}`,
  description: PRODUCT_DESCRIPTION,
  canonical: absoluteUrl('/'),
  ogImage: DEFAULT_OG_IMAGE,
  priority: 1,
  jsonLd: homeJsonLdGraph(),
};

const STATIC_MARKETING: SeoRouteMeta[] = [
  {
    path: '/gallery/',
    title: 'Room Gallery — Community Designs | Toova',
    description:
      'Browse public rooms designed in Toova. Get layout ideas for dorms, bedrooms, and small apartments.',
    canonical: absoluteUrl('/gallery/'),
    ogImage: DEFAULT_OG_IMAGE,
    priority: 0.7,
    jsonLd: articleJsonLdGraph({
      path: '/gallery/',
      title: 'Room Gallery — Community Designs | Toova',
      description:
        'Browse public rooms designed in Toova. Get layout ideas for dorms, bedrooms, and small apartments.',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Gallery', path: '/gallery/' },
      ],
    }),
  },
  {
    path: '/timeline/',
    title: 'Toova Timeline — Product Story and Demos',
    description:
      'Watch Toova demos and follow the product timeline: photo-to-3D room design for people about to spend money.',
    canonical: absoluteUrl('/timeline/'),
    ogImage: DEFAULT_OG_IMAGE,
    priority: 0.5,
    jsonLd: articleJsonLdGraph({
      path: '/timeline/',
      title: 'Toova Timeline — Product Story and Demos',
      description:
        'Watch Toova demos and follow the product timeline: photo-to-3D room design for people about to spend money.',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Timeline', path: '/timeline/' },
      ],
    }),
  },
  {
    path: '/pricing/',
    title: 'Pricing — Free, Lite, and Pro | Toova',
    description:
      'Toova is free for five rooms. Lite and Pro unlock more rooms, credits, and exports. Cancel anytime.',
    canonical: absoluteUrl('/pricing/'),
    ogImage: DEFAULT_OG_IMAGE,
    priority: 0.8,
    jsonLd: articleJsonLdGraph({
      path: '/pricing/',
      title: 'Pricing — Free, Lite, and Pro | Toova',
      description:
        'Toova is free for five rooms. Lite and Pro unlock more rooms, credits, and exports. Cancel anytime.',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Pricing', path: '/pricing/' },
      ],
    }),
  },
  {
    path: '/privacy/',
    title: 'Privacy Policy | Toova',
    description: 'How Toova collects, uses, and protects your data.',
    canonical: absoluteUrl('/privacy/'),
    ogImage: DEFAULT_OG_IMAGE,
    priority: 0.2,
    jsonLd: articleJsonLdGraph({
      path: '/privacy/',
      title: 'Privacy Policy | Toova',
      description: 'How Toova collects, uses, and protects your data.',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Privacy', path: '/privacy/' },
      ],
    }),
  },
  {
    path: '/terms/',
    title: 'Terms of Service | Toova',
    description: 'Terms that govern use of the Toova room designer.',
    canonical: absoluteUrl('/terms/'),
    ogImage: DEFAULT_OG_IMAGE,
    priority: 0.2,
    jsonLd: articleJsonLdGraph({
      path: '/terms/',
      title: 'Terms of Service | Toova',
      description: 'Terms that govern use of the Toova room designer.',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Terms', path: '/terms/' },
      ],
    }),
  },
  {
    path: '/safety/',
    title: 'Child Safety | Toova',
    description: 'Toova child safety standards and reporting.',
    canonical: absoluteUrl('/safety/'),
    ogImage: DEFAULT_OG_IMAGE,
    priority: 0.2,
    jsonLd: articleJsonLdGraph({
      path: '/safety/',
      title: 'Child Safety | Toova',
      description: 'Toova child safety standards and reporting.',
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Child Safety', path: '/safety/' },
      ],
    }),
  },
];

export const SEO_ROUTES: SeoRouteMeta[] = [
  HOME,
  ...STATIC_MARKETING,
  ...SEO_ARTICLES.map(articleToMeta),
];

const byPath = new Map<string, SeoRouteMeta>();
for (const route of SEO_ROUTES) {
  byPath.set(route.path, route);
  const trimmed = route.path.replace(/\/+$/, '') || '/';
  if (!byPath.has(trimmed)) byPath.set(trimmed, route);
}

export function getSeoRoute(pathname: string): SeoRouteMeta | undefined {
  if (pathname === '/' || pathname === '') return HOME;
  const withSlash = withTrailingSlash(pathname);
  return byPath.get(withSlash) ?? byPath.get(pathname.replace(/\/+$/, '') || '/');
}

export function listSeoPaths(): string[] {
  return SEO_ROUTES.map((r) => r.path);
}

/** Exposed for Playwright prerender + sitemap generation. */
export function exposeSeoRoutesToWindow(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __TOOVA_SEO_ROUTES__?: SeoRouteMeta[] }).__TOOVA_SEO_ROUTES__ =
    SEO_ROUTES;
}
