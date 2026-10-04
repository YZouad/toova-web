/**
 * Local dev proxy: POST /parse → Cursor Cloud Agents API (no-repo agent).
 * Run: node scripts/cursor-agentic-dev-server.mjs
 *
 * JSON parse helpers mirror src/lib/agenticRoomParseJson.ts (keep in sync).
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8790;
const HOST = '127.0.0.1';
const CURSOR_API = 'https://api.cursor.com/v1';
const POLL_MS = 2000;
const TIMEOUT_MS = 90_000;

const VIBE_IDS = new Set(['warm', 'neutral', 'studio', 'moody', 'sage']);
const VIBE_SYNONYMS = {
  warm: 'warm',
  cozy: 'warm',
  neutral: 'neutral',
  studio: 'studio',
  office: 'studio',
  moody: 'moody',
  dark: 'moody',
  sage: 'sage',
  green: 'sage',
};

function buildCursorFurniturePrompt(userPrompt) {
  return `You are a furniture and decor shopping assistant. Given a room description, produce a buyable shopping checklist with rough price estimates.

Return ONLY valid JSON. No markdown fences, no commentary, no prose before or after the JSON.

The user writes in casual, natural language — no fixed format. They may mention size, budget, theme, and must-haves in any order, or leave details out. Infer reasonable defaults for anything missing (typical dorm/bedroom size, common essentials for the room type).

Listen for themes even when casually phrased ("minecraft stuff", "dark gothic vibes", "coastal aesthetic", "anime room"). Always copy a specific named theme into the "theme" field and into decor search phrases.

Your job: infer a complete shopping list of physical items they should search for and buy to furnish that room, even if not every item was named explicitly.

Schema:
{
  "widthIn": number | null,
  "depthIn": number | null,
  "budgetCents": number | null,
  "roomType": string | null,
  "theme": string | null,
  "vibe": "warm" | "neutral" | "studio" | "moody" | "sage" | null,
  "estimatedTotalCents": number | null,
  "items": [
    {
      "query": string,
      "qty": number,
      "estimatedCents": number
    }
  ]
}

Rules for items:
- Each item must be a buyable furniture or decor product (queen bed, desk lamp, area rug, hangers, shelf unit, dresser, mirror, etc.)
- query = short search phrase you'd type into a store (e.g. "queen bed frame", "blackout curtains", "over-door hooks")
- Include commonly needed pieces for the room type and size, not only words copied from the description
- NEVER list the theme, room type, or vibe as its own item (bad: "gothic", "minecraft", "bedroom", "cozy")
- When a specific theme is named (Minecraft, gothic, coastal, etc.), put that theme in the search phrase for decor and textiles: bedding, rug, curtains, pillows, posters, string lights. Examples: "Minecraft twin XL bedding set", "Minecraft area rug", "Minecraft string lights"
- For wall posters use descriptive, trademark-free titles the Toova poster bank can match: "{theme adjective} {subject} wall poster" (good: "Gothic cathedral architecture wall poster", "Coastal beach shoreline wall poster", "Retro pixel gaming wall poster"; bad: "gothic poster", "Minecraft creeper poster")
- Include at least three theme-specific decor items. Keep structural furniture generic (bed frame, desk, chair, mattress) so a normal catalog can match it
- Every dorm/bedroom must include separate generic lines for bed frame, desk, chair, and desk lamp
- NEVER list built-in architecture as items unless shopping for organizers (bad: "closet" — good: "closet organizer")
- qty defaults to 1
- estimatedCents = rough USD cents for that entire line (unit price × qty). Use realistic budget-store estimates, not luxury pricing.
- estimatedTotalCents = sum of all line estimatedCents; keep near budgetCents when a budget was given
- widthIn/depthIn in inches (10x12 feet = 120 x 144)
- budgetCents in USD cents ($500 = 50000)
- roomType = short label for the room (e.g. "dorm bedroom")
- theme = style adjective or phrase from the description (e.g. "gothic", "minimalist")
- vibe = map theme to one of warm/neutral/studio/moody/sage when obvious, else null
- Do not invent brand names or product URLs
- Typical dorm/bedroom: 6–10 items. Larger rooms may have more.

Room description:
${userPrompt.trim()}`;
}

function extractJsonFromAgentText(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseVibeToken(raw) {
  const key = raw.trim().toLowerCase();
  return VIBE_SYNONYMS[key] ?? null;
}

function parseItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const query = typeof raw.query === 'string' ? raw.query.trim() : '';
  if (!query) return null;
  const qtyRaw = raw.qty;
  const qty =
    typeof qtyRaw === 'number' && Number.isFinite(qtyRaw) && qtyRaw > 0
      ? Math.floor(qtyRaw)
      : 1;
  const estRaw = raw.estimatedCents;
  const estimatedCents =
    typeof estRaw === 'number' && Number.isFinite(estRaw) && estRaw >= 0
      ? Math.round(estRaw)
      : undefined;
  return estimatedCents != null ? { query, qty, estimatedCents } : { query, qty };
}

function parseOptionalString(v) {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed || undefined;
}

function sumItemEstimates(items) {
  let total = 0;
  let any = false;
  for (const item of items) {
    if (item.estimatedCents != null) {
      total += item.estimatedCents;
      any = true;
    }
  }
  return any ? total : undefined;
}

function extractRunText(run) {
  if (!run || typeof run !== 'object') return '';
  if (typeof run.result === 'string') return run.result;
  if (typeof run.text === 'string') return run.text;
  if (run.result && typeof run.result === 'object' && typeof run.result.text === 'string') {
    return run.result.text;
  }
  return '';
}

function parseOptionalNumber(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined;
  return v;
}

function validateFurnitureListJson(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;

  const items = itemsRaw.map(parseItem).filter(Boolean);
  if (items.length === 0) return null;

  let vibe;
  if (typeof raw.vibe === 'string' && VIBE_IDS.has(raw.vibe)) {
    vibe = raw.vibe;
  } else if (typeof raw.vibe === 'string') {
    vibe = parseVibeToken(raw.vibe) ?? undefined;
  }

  return {
    items,
    widthIn: parseOptionalNumber(raw.widthIn),
    depthIn: parseOptionalNumber(raw.depthIn),
    budgetCents: parseOptionalNumber(raw.budgetCents),
    roomType: parseOptionalString(raw.roomType),
    theme: parseOptionalString(raw.theme),
    vibe,
    estimatedTotalCents:
      parseOptionalNumber(raw.estimatedTotalCents) ?? sumItemEstimates(items),
    warnings: [],
    source: 'cursor',
  };
}

function parseAgentTextToFurnitureList(text) {
  const raw = extractJsonFromAgentText(text);
  return validateFurnitureListJson(raw);
}

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function corsHeaders(origin) {
  const allowed =
    origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ? origin
      : 'http://localhost:5173';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function cursorFetch(apiKey, pathname, init) {
  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  return fetch(`${CURSOR_API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCursorAgent(apiKey, userPrompt) {
  const promptText = buildCursorFurniturePrompt(userPrompt);
  const createRes = await cursorFetch(apiKey, '/agents', {
    method: 'POST',
    body: JSON.stringify({
      prompt: { text: promptText },
      model: { id: 'composer-2.5' },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Cursor create failed (${createRes.status}): ${errText.slice(0, 300)}`);
  }

  const created = await createRes.json();
  const agentId = created.agent?.id;
  const runId = created.run?.id;
  if (!agentId || !runId) {
    throw new Error('Cursor response missing agent or run id');
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const runRes = await cursorFetch(apiKey, `/agents/${agentId}/runs/${runId}`);
    if (!runRes.ok) {
      const errText = await runRes.text();
      throw new Error(`Cursor poll failed (${runRes.status}): ${errText.slice(0, 200)}`);
    }

    const run = await runRes.json();
    const status = String(run.status ?? '').toUpperCase();
    if (status === 'FINISHED' || status === 'COMPLETED' || status === 'SUCCEEDED') {
      const text = extractRunText(run);
      if (!text.trim()) throw new Error('Cursor agent finished with empty text');
      return text;
    }
    if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
      throw new Error(`Cursor agent run ${status.toLowerCase()}`);
    }
  }

  throw new Error('Cursor agent timed out after 90s');
}

async function handleParse(apiKey, prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return { ok: false, error: 'Prompt is required.' };
  }
  if (trimmed.length > 2000) {
    return { ok: false, error: 'Prompt is too long (max 2000 characters).' };
  }

  const text = await runCursorAgent(apiKey, trimmed);
  const result = parseAgentTextToFurnitureList(text);
  if (!result) {
    return {
      ok: false,
      error: 'Could not parse furniture list from Cursor agent response.',
    };
  }
  return { ok: true, result };
}

const env = { ...process.env, ...loadEnvLocal() };
const apiKey = env.CURSOR_API_KEY?.trim();

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? null;
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, headers);
    res.end(JSON.stringify({ ok: true, hasKey: Boolean(apiKey) }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/parse') {
    res.writeHead(404, headers);
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  if (!apiKey) {
    res.writeHead(503, headers);
    res.end(
      JSON.stringify({
        ok: false,
        error: 'CURSOR_API_KEY missing. Add it to .env.local and restart the proxy.',
      }),
    );
    return;
  }

  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body);
    const response = await handleParse(apiKey, parsed.prompt ?? '');
    res.writeHead(response.ok ? 200 : 422, headers);
    res.end(JSON.stringify(response));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.writeHead(502, headers);
    res.end(JSON.stringify({ ok: false, error: message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[cursor-agentic] listening on http://${HOST}:${PORT}`);
  if (!apiKey) {
    console.warn('[cursor-agentic] CURSOR_API_KEY not set — /parse will return 503');
  }
});
