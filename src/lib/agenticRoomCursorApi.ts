import type { AgenticFurnitureListResult } from './agenticRoomListTypes';
import { enrichFurnitureListWithTheme } from './agenticRoomParseJson';

const PARSE_URL = '/api/agentic-room/parse';
const CLIENT_TIMEOUT_MS = 95_000;

function cursorUnavailable(message: string): AgenticFurnitureListResult {
  return {
    items: [],
    warnings: [
      message,
      'Start the Cursor proxy: npm run dev:agentic with CURSOR_API_KEY in .env.local.',
    ],
    source: 'rules-fallback',
  };
}

export async function fetchFurnitureListFromCursor(
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
    const res = await fetch(PARSE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: trimmed }),
      signal: controller.signal,
    });

    const data = (await res.json()) as {
      ok?: boolean;
      result?: AgenticFurnitureListResult;
      error?: string;
    };

    if (res.ok && data.ok && data.result?.items?.length) {
      return enrichFurnitureListWithTheme(
        {
          ...data.result,
          source: 'cursor',
          warnings: data.result.warnings ?? [],
        },
        trimmed,
      );
    }

    const errMsg = data.error ?? `Proxy returned ${res.status}`;
    return cursorUnavailable(errMsg);
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Cursor request timed out after 90 seconds.'
        : err instanceof Error
          ? err.message
          : 'Network error';
    return cursorUnavailable(message);
  } finally {
    clearTimeout(timer);
  }
}
