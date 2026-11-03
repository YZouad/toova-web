import { useEffect } from 'react';
import { applyDocumentHead } from '../lib/seo/documentHead';
import {
  exposeSeoRoutesToWindow,
  getSeoRoute,
  type SeoRouteMeta,
} from '../lib/seo/routes';
import type { AppRoute } from './useRoute';

function pathForRoute(route: AppRoute): string | null {
  switch (route.name) {
    case 'home':
      return '/';
    case 'gallery':
      return '/gallery/';
    case 'timeline':
      return '/timeline/';
    case 'pricing':
      return '/pricing/';
    case 'privacy':
      return '/privacy/';
    case 'terms':
      return '/terms/';
    case 'safety':
      return '/safety/';
    case 'seoPage':
      return route.path;
    case 'resetPassword':
    case 'shared':
    case 'profile':
    case 'publicRoom':
      return null;
    default:
      return null;
  }
}

/** Keep <head> in sync with the current public marketing route. */
export function useDocumentHead(route: AppRoute, override?: SeoRouteMeta | null): void {
  useEffect(() => {
    exposeSeoRoutesToWindow();
  }, []);

  useEffect(() => {
    const meta = override ?? (() => {
      const path = pathForRoute(route);
      return path ? getSeoRoute(path) : undefined;
    })();
    if (meta) {
      applyDocumentHead(meta);
      document.documentElement.dataset.seoReady = '1';
    }
  }, [route, override]);
}
