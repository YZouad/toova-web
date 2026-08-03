import { supabase } from './supabase';

const SUPABASE_URL = 'https://xfifgtedssabneqlxbhf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_BKydIgobs2Vj7Wf-PNCl_w_FUm4y2xv';

/**
 * Token-bound signed URLs for share-link private assets.
 * Uses the sign-share-assets edge function (path alone is not enough).
 */
export async function signShareAssetPaths(
  token: string,
  expiresSec = 60 * 60,
): Promise<Record<string, string>> {
  const trimmed = token.trim();
  if (!trimmed) return {};

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  } else {
    headers.Authorization = `Bearer ${SUPABASE_PUBLISHABLE_KEY}`;
  }

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/sign-share-assets`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: trimmed, expires_sec: expiresSec }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Share asset signing failed (${res.status})`);
  }

  const body = (await res.json()) as { urls?: Record<string, string> };
  return body.urls && typeof body.urls === 'object' ? body.urls : {};
}

/** Resolve a storage path through share-signed URLs map, else null. */
export function urlFromShareMap(
  path: string | null | undefined,
  urls: Record<string, string>,
): string | null {
  const key = path?.trim();
  if (!key) return null;
  return urls[key] ?? null;
}
