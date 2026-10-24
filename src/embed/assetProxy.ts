import * as THREE from 'three';

/** Hosts whose CORS rules only list toova.net; the iOS shell fetches them for us. */
const PROXIED_HOSTS = new Set(['assets.toova.net']);

export function nativeAssetUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== 'https:' || !PROXIED_HOSTS.has(parsed.host)) return url;
    return `${window.location.protocol}//${window.location.host}/__proxy/${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function installNativeAssetProxy(): void {
  THREE.DefaultLoadingManager.setURLModifier(nativeAssetUrl);
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return nativeFetch(nativeAssetUrl(input), init);
    if (input instanceof URL) return nativeFetch(nativeAssetUrl(input.href), init);
    return nativeFetch(input, init);
  };
}
