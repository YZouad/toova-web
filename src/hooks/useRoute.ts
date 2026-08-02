/** Lightweight pathname routing for share links without replacing the Screen machine. */

import { useEffect, useState } from 'react';
import { parseShareTokenFromPath } from '../lib/roomShares';

export type AppRoute =
  | { name: 'app' }
  | { name: 'shared'; token: string };

function readRoute(): AppRoute {
  if (typeof window === 'undefined') return { name: 'app' };
  const token = parseShareTokenFromPath(window.location.pathname);
  if (token) return { name: 'shared', token };
  return { name: 'app' };
}

export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);

  return route;
}

export function navigateToAppHome() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const target = `${base}/` || '/';
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
