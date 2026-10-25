import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  claimAppStoreNotification,
  completeAppStoreNotification,
  expireSubscription,
  failAppStoreNotification,
  fulfillTransaction,
  msToIso,
  parseNotificationPayload,
  revokeTransaction,
  userForOriginalTxn,
} from "../_shared/appstore.ts";
import { handleAppStoreNotification } from "./handleNotification.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json().catch(() => null) as { signedPayload?: string } | null;
  const signedPayload = typeof body?.signedPayload === "string" ? body.signedPayload.trim() : "";
  if (!signedPayload) {
    return new Response(JSON.stringify({ error: "signedPayload required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await handleAppStoreNotification(
    {
      claim: claimAppStoreNotification,
      complete: completeAppStoreNotification,
      fail: failAppStoreNotification,
      fulfill: fulfillTransaction,
      revoke: revokeTransaction,
      expire: expireSubscription,
      userForOriginalTxn,
      msToIso,
      parsePayload: parseNotificationPayload,
    },
    signedPayload,
  );

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
