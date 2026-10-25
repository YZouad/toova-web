import { SUPABASE_URL } from '../lib/supabase';

type ReplyHandler = { postMessage: (body: unknown) => Promise<unknown> };

function authHandler(): ReplyHandler | null {
  const w = window as Window & {
    webkit?: { messageHandlers?: { toovaAuth?: ReplyHandler } };
  };
  return w.webkit?.messageHandlers?.toovaAuth ?? null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Refresh tokens are single-use, so the iOS app does every refresh and answers in
 * GoTrue's token response shape; the web client never rotates the app's token.
 */
export function installNativeTokenRefresh(): void {
  const tokenEndpoint = `${SUPABASE_URL}/auth/v1/token`;
  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const handler = authHandler();
    if (!handler || !url.startsWith(tokenEndpoint) || !url.includes('grant_type=refresh_token')) {
      return previousFetch(input, init);
    }
    try {
      const session = await handler.postMessage({ type: 'refreshSession' });
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'native_session_unavailable',
          error_description: err instanceof Error ? err.message : String(err),
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
  };
}
