import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  HttpError,
  json,
  requireUserId,
} from "../_shared/stripeBilling.ts";
import {
  assertAppAccountTokenMatchesUser,
  fulfillTransaction,
  msToIso,
  parseTransactionInfo,
} from "../_shared/appstore.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const userId = await requireUserId(req);
    const body = await req.json() as {
      signed_transaction?: unknown;
      /** Legacy stub fields — ignored when signed_transaction present */
      transaction_id?: unknown;
      product_id?: unknown;
    };

    const signed = typeof body.signed_transaction === "string"
      ? body.signed_transaction.trim()
      : "";
    if (!signed) {
      return json({ error: "signed_transaction required." }, 400);
    }

    const txn = await parseTransactionInfo(signed);
    const transactionId = txn.transactionId?.trim();
    const productId = txn.productId?.trim();
    if (!transactionId || !productId) {
      return json({ error: "Transaction missing id or productId." }, 400);
    }

    if (txn.revocationDate) {
      return json({ error: "Transaction was revoked." }, 400);
    }

    assertAppAccountTokenMatchesUser(txn.appAccountToken, userId);

    const result = await fulfillTransaction({
      userId,
      transactionId,
      originalTransactionId: txn.originalTransactionId ?? transactionId,
      productId,
      environment: txn.environment ?? null,
      expiresAt: msToIso(txn.expiresDate),
      appAccountToken: txn.appAccountToken ?? null,
      purchasedAt: msToIso(txn.purchaseDate),
      raw: txn as Record<string, unknown>,
    });

    return json({ ok: true, result });
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("appstore-transaction", message);
    if (message.includes("another platform")) {
      return json({ error: message }, 409);
    }
    if (message.includes("app_account_token mismatch")) {
      return json({ error: "Purchase is not linked to this account." }, 403);
    }
    if (message.includes("already owned")) {
      return json({ error: "Purchase already linked to another account." }, 409);
    }
    if (message.includes("unknown app store product")) {
      return json({ error: message }, 400);
    }
    return json({ error: "Could not fulfill App Store purchase." }, 500);
  }
});
