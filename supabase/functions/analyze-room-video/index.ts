/**
 * Room scan — proxies to toova-bff POST /api/agentic-room/analyze (Amazon Bedrock vision).
 * verify_jwt = false (anon key + rate limit on BFF).
 */

const DEFAULT_BFF_ORIGIN = 'https://toova-bff.onrender.com';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bffAnalyzeUrl(): string {
  const base = Deno.env.get('AGENTIC_ROOM_BFF_URL')?.trim() || DEFAULT_BFF_ORIGIN;
  return `${base.replace(/\/$/, '')}/api/agentic-room/analyze`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const upstream = await fetch(bffAnalyzeUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analyze failed';
    return json({ ok: false, error: message }, 502);
  }
});
