import { useCallback, useEffect, useState } from 'react';

export type AppRoute =
  | { name: 'home' }
  | { name: 'gallery' }
  | { name: 'timeline' }
  | { name: 'terms' }
  | { name: 'privacy' }
  | { name: 'safety' }
  | { name: 'shared'; token: string }
  | { name: 'profile'; handle: string }
  | { name: 'publicRoom'; handle: string; roomId: string };

const SHARE_PATH_RE = /^\/r\/([A-Za-z0-9_-]{16,32})\/?$/;
const PROFILE_PATH_RE = /^\/u\/([a-z0-9_]{3,30})\/?$/i;
const PUBLIC_ROOM_PATH_RE =
  /^\/u\/([a-z0-9_]{3,30})\/r\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const GALLERY_PATH_RE = /^\/gallery\/?$/i;
const TIMELINE_PATH_RE = /^\/timeline\/?$/i;
const TERMS_PATH_RE = /^\/terms\/?$/i;
const PRIVACY_PATH_RE = /^\/privacy\/?$/i;
const SAFETY_PATH_RE = /^\/safety\/?$/i;

export function parsePathname(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (GALLERY_PATH_RE.test(path) || path === '/gallery') {
    return { name: 'gallery' };
  }

  if (TIMELINE_PATH_RE.test(path) || path === '/timeline') {
    return { name: 'timeline' };
  }

  if (TERMS_PATH_RE.test(path)) return { name: 'terms' };
  if (PRIVACY_PATH_RE.test(path)) return { name: 'privacy' };
  if (SAFETY_PATH_RE.test(path)) return { name: 'safety' };

  const room = path.match(PUBLIC_ROOM_PATH_RE);
  if (room?.[1] && room[2]) {
    return {
      name: 'publicRoom',
      handle: room[1].toLowerCase(),
      roomId: room[2].toLowerCase(),
    };
  }

  const profile = path.match(PROFILE_PATH_RE);
  if (profile?.[1]) {
    return { name: 'profile', handle: profile[1].toLowerCase() };
  }

  const share = path.match(SHARE_PATH_RE);
  if (share?.[1]) return { name: 'shared', token: share[1] };

  return { name: 'home' };
}

export function sharePath(token: string): string {
  return `/r/${token}`;
}

export function profilePath(handle: string): string {
  return `/u/${handle.toLowerCase()}`;
}

export function publicRoomPath(handle: string, roomId: string): string {
  return `/u/${handle.toLowerCase()}/r/${roomId}`;
}

export function galleryPath(search = ''): string {
  return `/gallery${search.startsWith('?') || search === '' ? search : `?${search}`}`;
}

export function timelinePath(): string {
  return '/timeline';
}

export function termsPath(): string {
  return '/terms';
}

export function privacyPath(): string {
  return '/privacy';
}

export function safetyPath(): string {
  return '/safety';
}

export function navigate(path: string, replace = false): void {
  const url = path.startsWith('/') ? path : `/${path}`;
  if (replace) {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Lightweight pathname router (no react-router). */
export function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() =>
    parsePathname(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => setRoute(parsePathname(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return route;
}

export function useNavigate() {
  return useCallback((path: string, replace = false) => {
    navigate(path, replace);
  }, []);
}
