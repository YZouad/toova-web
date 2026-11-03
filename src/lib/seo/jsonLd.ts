import {
  ORGANIZATION_SAME_AS,
  PRODUCT_DESCRIPTION,
  PRODUCT_NAME,
  SEO_FAQ,
  type SeoFaqItem,
} from './facts';
import { absoluteUrl, SITE_ORIGIN } from './site';

export function organizationJsonLd() {
  return {
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: PRODUCT_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/toova-logo.png`,
    sameAs: [...ORGANIZATION_SAME_AS],
  };
}

export function websiteJsonLd() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: PRODUCT_NAME,
    url: `${SITE_ORIGIN}/`,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
  };
}

export function softwareApplicationJsonLd() {
  return {
    '@type': 'SoftwareApplication',
    name: PRODUCT_NAME,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web, iOS',
    url: `${SITE_ORIGIN}/`,
    description: PRODUCT_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
  };
}

export function faqPageJsonLd(faq: SeoFaqItem[] = SEO_FAQ) {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function webPageJsonLd(opts: {
  path: string;
  title: string;
  description: string;
}) {
  return {
    '@type': 'WebPage',
    '@id': `${absoluteUrl(opts.path)}#webpage`,
    url: absoluteUrl(opts.path),
    name: opts.title,
    description: opts.description,
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    about: { '@id': `${SITE_ORIGIN}/#organization` },
  };
}

/** Homepage graph: org + site + app + FAQ. */
export function homeJsonLdGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationJsonLd(),
      websiteJsonLd(),
      softwareApplicationJsonLd(),
      faqPageJsonLd(),
    ],
  };
}

export function articleJsonLdGraph(opts: {
  path: string;
  title: string;
  description: string;
  breadcrumbs: { name: string; path: string }[];
  faq?: SeoFaqItem[];
}) {
  const graph: Record<string, unknown>[] = [
    organizationJsonLd(),
    websiteJsonLd(),
    webPageJsonLd(opts),
    breadcrumbJsonLd(opts.breadcrumbs),
  ];
  if (opts.faq?.length) {
    graph.push(faqPageJsonLd(opts.faq));
  }
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
