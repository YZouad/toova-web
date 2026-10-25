/** Best-effort check that a model URL exists before useGLTF tries to load it. */
export async function probeModelUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
    if (res.status === 405 || res.status === 501) {
      const ranged = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      return ranged.ok || ranged.status === 206;
    }
    return false;
  } catch {
    return false;
  }
}

/** True when the URL is served from the current site (or a relative public/ path). */
export function isSameOriginModelUrl(url: string): boolean {
  if (url.startsWith('/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
