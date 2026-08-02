/**
 * Token-bound signed URLs for private share assets.
 * Body: { token: string, expires_sec?: number }
 * Returns: { urls: Record<path, signedUrl> }
 *
 * Validates the share token via list_share_asset_paths, then signs with service role.
 * verify_jwt is false so anon share viewers can call; authorization is the share token.
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
    const supabaseURL = requireEnv("SUPABASE_URL");
    const serviceKey = requireServiceKey();
    const body = await req.json() as {
      token?: unknown;
      expires_sec?: unknown;
    };

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length < 16 || token.length > 128) {
      return json({ error: "Invalid share token." }, 400);
    }

    const expiresSec = clampExpires(body.expires_sec);

    const pathsRes = await fetch(
      `${supabaseURL}/rest/v1/rpc/list_share_asset_paths`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_token: token }),
      },
    );
    if (!pathsRes.ok) {
      const detail = await pathsRes.text();
      console.error("list_share_asset_paths failed", detail);
      return json({ error: "Could not resolve share assets." }, 502);
    }

    const rows = await pathsRes.json() as Array<{
      object_path?: string;
      bucket_id?: string;
    }>;

    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ urls: {} });
    }

    const urls: Record<string, string> = {};
    for (const row of rows) {
      const path = typeof row.object_path === "string" ? row.object_path.trim() : "";
      const bucket = typeof row.bucket_id === "string" && row.bucket_id
        ? row.bucket_id
        : "model-files";
      if (!path) continue;

      const signed = await createSignedUrl(
        supabaseURL,
        serviceKey,
        bucket,
        path,
        expiresSec,
      );
      if (signed) {
        urls[path] = signed;
      }
    }

    return json({ urls, expires_sec: expiresSec });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Signing failed." },
      500,
    );
  }
});

function clampExpires(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 60 * 60;
  return Math.min(Math.max(Math.floor(n), 60), 60 * 60 * 24);
}

async function createSignedUrl(
  supabaseURL: string,
  serviceKey: string,
  bucket: string,
  path: string,
  expiresSec: number,
): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${supabaseURL}/storage/v1/object/sign/${bucket}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: expiresSec }),
    },
  );
  if (!response.ok) {
    console.error("sign failed", bucket, path, await response.text());
    return null;
  }
  const data = await response.json() as { signedURL?: string; signedUrl?: string };
  const relative = data.signedURL ?? data.signedUrl;
  if (!relative) return null;
  if (relative.startsWith("http")) return relative;
  return `${supabaseURL}/storage/v1${relative.startsWith("/") ? "" : "/"}${relative}`;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function requireServiceKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) throw new Error("Missing Supabase service role key.");
  const parsed = JSON.parse(secretKeys) as Record<string, string>;
  const serviceKey = parsed.default ?? Object.values(parsed)[0];
  if (!serviceKey) throw new Error("No Supabase secret key is available.");
  return serviceKey;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
