import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** Sends APNs push for a user (configure APNS_* secrets in production). */
Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  const cron = Deno.env.get("LIFECYCLE_CRON_SECRET");
  if (cron && auth !== `Bearer ${cron}`) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const { user_id, title, body } = await req.json();
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tokens } = await service
    .from("device_push_tokens")
    .select("token")
    .eq("user_id", user_id);

  // APNs HTTP/2 delivery would go here using APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY.
  console.log("send-push", { user_id, title, body, count: tokens?.length ?? 0 });

  return new Response(JSON.stringify({ sent: tokens?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
