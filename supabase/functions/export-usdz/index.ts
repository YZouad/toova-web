import { corsHeaders, json, requireUserId, restRpc } from "../_shared/stripeBilling.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await requireUserId(req);
    const body = await req.json() as { catalog_kind?: unknown; glb_path?: unknown };
    const catalogKind = typeof body.catalog_kind === "string" ? body.catalog_kind.trim() : "";
    const glbPath = typeof body.glb_path === "string" ? body.glb_path.trim() : "";
    if (!catalogKind || !glbPath) {
      return json({ error: "catalog_kind and glb_path are required." }, 400);
    }

    const ent = await restRpc("get_entitlements", { p_uid: userId }) as {
      ar_export?: boolean;
    };
    if (!ent?.ar_export) {
      return json({ error: "ar_export_requires_pro", code: "paywall" }, 403);
    }

    if (!glbPath.startsWith(`${userId}/`)) {
      return json({ error: "GLB path is not owned by you." }, 403);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server misconfigured." }, 500);
    }

    const auth = req.headers.get("authorization") ?? "";
    const forward = await fetch(`${supabaseUrl}/functions/v1/glb-to-usdz`, {
      method: "POST",
      headers: {
        Authorization: auth,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        catalog_kind: catalogKind,
        glb_path: glbPath,
        user_id: userId,
      }),
    });

    const text = await forward.text();
    if (!forward.ok) {
      return new Response(text, {
        status: forward.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Export failed." }, 500);
  }
});
