/**
 * Authenticated trigger: ask GitHub Actions to redeploy Pages with fresh unfurls.
 * Body: none required.
 *
 * Secrets: GITHUB_UNFURL_PAT (actions:write), GITHUB_REPO (owner/name)
 * verify_jwt defaults to true — caller must send a user access token.
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ") || auth.length < 20) {
      return json({ error: "Unauthorized." }, 401);
    }

    const pat = requireEnv("GITHUB_UNFURL_PAT");
    const repo = requireEnv("GITHUB_REPO"); // e.g. owner/toova-web

    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${pat}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "toova-request-unfurl-deploy",
        },
        body: JSON.stringify({
          event_type: "unfurl-refresh",
          client_payload: { source: "request-unfurl-deploy" },
        }),
      },
    );

    // GitHub returns 204 No Content on success.
    if (ghRes.status !== 204 && !ghRes.ok) {
      const detail = await ghRes.text().catch(() => "");
      console.error("repository_dispatch failed", ghRes.status, detail);
      return json({ error: "Could not trigger Pages redeploy." }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Dispatch failed." },
      500,
    );
  }
});

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
