import type { SeoRouteMeta } from './routes';
import { DEFAULT_OG_IMAGE } from './site';

const JSON_LD_ATTR = 'data-toova-jsonld';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(data: Record<string, unknown>): void {
  let el = document.head.querySelector<HTMLScriptElement>(`script[${JSON_LD_ATTR}]`);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute(JSON_LD_ATTR, '1');
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeRobotsIfIndexing(): void {
  document.head.querySelector('meta[name="robots"]')?.remove();
}

/** Apply title, description, canonical, OG/Twitter, and JSON-LD for a route. */
export function applyDocumentHead(meta: SeoRouteMeta): void {
  document.title = meta.title;
  upsertMeta('name', 'description', meta.description);
  upsertLink('canonical', meta.canonical);

  const image = meta.ogImage || DEFAULT_OG_IMAGE;
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:site_name', 'Toova');
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:url', meta.canonical);
  upsertMeta('property', 'og:image', image);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', meta.title);
  upsertMeta('name', 'twitter:description', meta.description);
  upsertMeta('name', 'twitter:image', image);

  if (meta.noindex) {
    upsertMeta('name', 'robots', 'noindex,nofollow');
  } else {
    removeRobotsIfIndexing();
  }

  upsertJsonLd(meta.jsonLd);
}
