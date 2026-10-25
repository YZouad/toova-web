import { agenticRoomUrl } from '../agenticRoomApi';
import {
  agenticRoomAuthHeaders,
  explainAgenticRoomAuthError,
  logAgenticRoomResponse,
} from '../agenticRoomAuth';
import { readAgenticRoomJson } from '../agenticRoomFetch';
import { parseReviseAgentResponse, type ReviseAction } from './reviseSchema';
import type { ReviseRoomSnapshot } from './roomSnapshot';

const REVISE_URL = agenticRoomUrl('/revise');
const CLIENT_TIMEOUT_MS = 95_000;

export interface ReviseChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface FetchDesignerReviseInput {
  message: string;
  snapshot: ReviseRoomSnapshot;
  history?: ReviseChatTurn[];
}

export interface FetchDesignerReviseResult {
  ok: boolean;
  reply: string;
  actions: ReviseAction[];
  error?: string;
}

export async function fetchDesignerRevise(
  input: FetchDesignerReviseInput,
): Promise<FetchDesignerReviseResult> {
  const trimmed = input.message.trim();
  if (!trimmed) {
    return { ok: false, reply: '', actions: [], error: 'Enter a message.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const { headers: authHeaders, diagnostics } = await agenticRoomAuthHeaders('revise');
    const res = await fetch(REVISE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        message: trimmed,
        snapshot: input.snapshot,
        history: (input.history ?? []).slice(-6),
      }),
      signal: controller.signal,
    });

    const parsed = await readAgenticRoomJson<{
      ok?: boolean;
      reply?: string;
      actions?: unknown;
      error?: string;
    }>(res);

    const apiError = parsed.error || parsed.data?.error || '';
    logAgenticRoomResponse(diagnostics, parsed.status, apiError);

    if (!parsed.ok || !parsed.data) {
      return {
        ok: false,
        reply: '',
        actions: [],
        error: explainAgenticRoomAuthError(
          diagnostics,
          parsed.error || `Revise request failed (HTTP ${parsed.status})`,
        ),
      };
    }

    const data = parsed.data;

    if (data.ok && typeof data.reply === 'string') {
      const parsedActions = parseReviseAgentResponse({ reply: data.reply, actions: data.actions });
      return {
        ok: true,
        reply: parsedActions?.reply ?? data.reply,
        actions: parsedActions?.actions ?? [],
      };
    }

    return {
      ok: false,
      reply: data.reply ?? '',
      actions: [],
      error: explainAgenticRoomAuthError(
        diagnostics,
        parsed.error || data.error || `Revise request failed (HTTP ${parsed.status})`,
      ),
    };
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Revise request timed out.'
        : err instanceof Error
          ? err.message
          : 'Network error';
    return {
      ok: false,
      reply: '',
      actions: [],
      error: `${message} Check toova-bff Bedrock config (AWS credentials on Render).`,
    };
  } finally {
    clearTimeout(timer);
  }
}
