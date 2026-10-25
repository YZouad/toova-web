import { supabase } from './supabase';

export const AGENTIC_ROOM_DEBUG =
  import.meta.env.DEV ||
  import.meta.env.VITE_AGENTIC_ROOM_DEBUG === 'true' ||
  import.meta.env.VITE_AGENTIC_ROOM_DEBUG === '1';

export interface AgenticRoomAuthDiagnostics {
  route: string;
  hasSession: boolean;
  userId: string | null;
  userEmail: string | null;
  tokenLength: number;
  expiresAt: number | null;
  expiresInSec: number | null;
  sentAuthorization: boolean;
  getSessionError: string | null;
}

function debugLog(message: string, detail?: Record<string, unknown>): void {
  if (!AGENTIC_ROOM_DEBUG) return;
  if (detail) {
    console.debug(`[agentic-room] ${message}`, detail);
  } else {
    console.debug(`[agentic-room] ${message}`);
  }
}

export function warnAgenticRoom(message: string, detail?: Record<string, unknown>): void {
  console.warn(`[agentic-room] ${message}`, detail ?? '');
}

export async function agenticRoomAuthHeaders(route: string): Promise<{
  headers: Record<string, string>;
  diagnostics: AgenticRoomAuthDiagnostics;
}> {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  const token = session?.access_token ?? '';
  const expiresAt = session?.expires_at ?? null;
  const expiresInSec =
    expiresAt != null ? Math.round(expiresAt - Date.now() / 1000) : null;

  const diagnostics: AgenticRoomAuthDiagnostics = {
    route,
    hasSession: !!session,
    userId: session?.user?.id ?? null,
    userEmail: session?.user?.email ?? null,
    tokenLength: token.length,
    expiresAt,
    expiresInSec,
    sentAuthorization: false,
    getSessionError: error?.message ?? null,
  };

  debugLog(`auth check (${route})`, { ...diagnostics });

  if (error) {
    warnAgenticRoom(`supabase.auth.getSession failed for ${route}`, {
      message: error.message,
    });
  }

  if (!token) {
    warnAgenticRoom(
      `No Supabase access token for ${route} — BFF will respond with "Missing Authorization header"`,
      { ...diagnostics },
    );
    return { headers: {}, diagnostics };
  }

  if (expiresInSec != null && expiresInSec <= 0) {
    warnAgenticRoom(`Supabase session token appears expired for ${route}`, { ...diagnostics });
  }

  diagnostics.sentAuthorization = true;
  debugLog(`attaching Authorization for ${route}`, {
    userId: diagnostics.userId,
    tokenLength: diagnostics.tokenLength,
    expiresInSec: diagnostics.expiresInSec,
  });

  return {
    headers: { Authorization: `Bearer ${token}` },
    diagnostics,
  };
}

export function isMissingAuthorizationError(message: string): boolean {
  return /missing authorization header/i.test(message);
}

/** User-facing hint when BFF returns 401 Missing Authorization. */
export function explainAgenticRoomAuthError(
  diagnostics: AgenticRoomAuthDiagnostics,
  bffError: string,
): string {
  if (!isMissingAuthorizationError(bffError)) {
    return bffError;
  }

  if (AGENTIC_ROOM_DEBUG) {
    warnAgenticRoom('BFF returned Missing Authorization header', {
      bffError,
      diagnostics,
      hint:
        'Compare hasSession/sentAuthorization here with whether the UI shows you as signed in.',
    });
  }

  if (!diagnostics.hasSession || diagnostics.tokenLength === 0) {
    return (
      `${bffError} The browser had no Supabase session token when calling ${diagnostics.route} ` +
      `(getSession: hasSession=${diagnostics.hasSession}, tokenLength=${diagnostics.tokenLength}). ` +
      'Try refreshing the page or signing out and back in. Enable VITE_AGENTIC_ROOM_DEBUG=1 for console details.'
    );
  }

  if (!diagnostics.sentAuthorization) {
    return (
      `${bffError} A session existed (user ${diagnostics.userId ?? 'unknown'}) but the client did not attach Authorization. ` +
      'This is unexpected — check the console for [agentic-room] logs.'
    );
  }

  return (
    `${bffError} The client sent Authorization (token length ${diagnostics.tokenLength}, user ${diagnostics.userId ?? 'unknown'}). ` +
    'The BFF or dev proxy may have dropped the header — confirm TRELLIS_BFF_ORIGIN points at toova-bff and retry with VITE_AGENTIC_ROOM_DEBUG=1.'
  );
}

export function logAgenticRoomResponse(
  diagnostics: AgenticRoomAuthDiagnostics,
  status: number,
  error: string,
): void {
  if (!error && status < 400) {
    debugLog(`response ${diagnostics.route}`, { status, sentAuthorization: diagnostics.sentAuthorization });
    return;
  }

  const payload = { status, error, diagnostics };
  if (isMissingAuthorizationError(error)) {
    warnAgenticRoom(`401 Missing Authorization on ${diagnostics.route}`, payload);
  } else if (status >= 400) {
    warnAgenticRoom(`request failed ${diagnostics.route}`, payload);
  }
}
