import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import { agenticRoomUrl } from './agenticRoomApi';
import {
  agenticRoomAuthHeaders,
  explainAgenticRoomAuthError,
  logAgenticRoomResponse,
} from './agenticRoomAuth';
import { readAgenticRoomJson } from './agenticRoomFetch';
import { enrichFurnitureListWithTheme } from './agenticRoomParseJson';

const PARSE_URL = agenticRoomUrl('/parse');
const CLIENT_TIMEOUT_MS = 95_000;

function agentUnavailable(message: string): AgenticFurnitureListResult {
  return {
    items: [],
    warnings: [
      message,
      'Check that toova-bff is deployed with AWS Bedrock credentials (AWS_ACCESS_KEY_ID, AWS_REGION).',
    ],
    source: 'rules-fallback',
  };
}

export async function fetchAgenticFurnitureList(
  prompt: string,
): Promise<AgenticFurnitureListResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      items: [],
      warnings: ['Enter a room description.'],
      source: 'rules-fallback',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const { headers: authHeaders, diagnostics } = await agenticRoomAuthHeaders('parse');
    const res = await fetch(PARSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ prompt: trimmed }),
      signal: controller.signal,
    });

    const parsed = await readAgenticRoomJson<{
      ok?: boolean;
      result?: AgenticFurnitureListResult;
      error?: string;
    }>(res);

    const apiError = parsed.error || parsed.data?.error || '';
    logAgenticRoomResponse(diagnostics, parsed.status, apiError);

    if (!parsed.ok || !parsed.data) {
      return agentUnavailable(explainAgenticRoomAuthError(diagnostics, parsed.error));
    }

    const data = parsed.data;

    if (data.ok && data.result?.items?.length) {
      const source = 'bedrock' as const;
      return enrichFurnitureListWithTheme(
        {
          ...data.result,
          source,
          warnings: data.result.warnings ?? [],
        },
        trimmed,
      );
    }

    return agentUnavailable(
      explainAgenticRoomAuthError(
        diagnostics,
        parsed.error || data.error || `Request failed (HTTP ${parsed.status})`,
      ),
    );
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'AI request timed out after 90 seconds.'
        : err instanceof Error
          ? err.message
          : 'Network error';
    return agentUnavailable(message);
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Use fetchAgenticFurnitureList */
export const fetchFurnitureListFromCursor = fetchAgenticFurnitureList;
