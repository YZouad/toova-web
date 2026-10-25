/** App Store Server Notifications V2 handler (Deno + Vitest). */

import type { AppStoreNotificationPayload, AppStoreTransactionPayload } from "../_shared/appstore.ts";

export type NotificationDeps = {
  claim: (
    uuid: string,
    type: string,
    subtype?: string | null,
  ) => Promise<{ ok: boolean; claimed?: boolean; duplicate?: boolean; in_flight?: boolean }>;
  complete: (uuid: string) => Promise<void>;
  fail: (uuid: string, error: string) => Promise<void>;
  fulfill: (input: {
    userId: string;
    transactionId: string;
    originalTransactionId?: string | null;
    productId: string;
    environment?: string | null;
    expiresAt?: string | null;
    appAccountToken?: string | null;
    purchasedAt?: string | null;
    raw?: Record<string, unknown> | null;
  }) => Promise<Record<string, unknown>>;
  revoke: (transactionId: string, reason?: string) => Promise<Record<string, unknown>>;
  expire: (originalTransactionId: string) => Promise<Record<string, unknown>>;
  userForOriginalTxn: (originalTransactionId: string) => Promise<string | null>;
  msToIso: (ms: number | undefined | null) => string | null;
  parsePayload: (signedPayload: string) => Promise<{
    notification: AppStoreNotificationPayload;
    transaction: AppStoreTransactionPayload | null;
  }>;
};

function resolveUserId(
  txn: AppStoreTransactionPayload | null,
): string | null {
  const token = txn?.appAccountToken?.trim();
  return token && token.length > 0 ? token : null;
}

export async function handleAppStoreNotification(
  deps: NotificationDeps,
  signedPayload: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { notification, transaction } = await deps.parsePayload(signedPayload);
  const uuid = notification.notificationUUID?.trim();
  const type = notification.notificationType?.trim() ?? "UNKNOWN";
  const subtype = notification.subtype?.trim() ?? null;

  if (!uuid) {
    return { status: 400, body: { error: "missing notificationUUID" } };
  }

  if (type === "TEST") {
    const claim = await deps.claim(uuid, type, subtype);
    if (claim.claimed) await deps.complete(uuid);
    return { status: 200, body: { ok: true, test: true } };
  }

  const claim = await deps.claim(uuid, type, subtype);
  if (claim.duplicate || claim.in_flight) {
    return { status: 200, body: { ok: true, duplicate: Boolean(claim.duplicate), in_flight: Boolean(claim.in_flight) } };
  }

  try {
    const originalId = transaction?.originalTransactionId?.trim()
      ?? transaction?.transactionId?.trim()
      ?? null;
    let userId = resolveUserId(transaction);
    if (!userId && originalId) {
      userId = await deps.userForOriginalTxn(originalId);
    }

    const transactionId = transaction?.transactionId?.trim();
    const productId = transaction?.productId?.trim();

    switch (type) {
      case "SUBSCRIBED":
      case "DID_RENEW":
      case "OFFER_REDEEMED":
      case "DID_CHANGE_RENEWAL_PREF": {
        if (!userId || !transactionId || !productId) {
          throw new Error("missing user/transaction for grant notification");
        }
        await deps.fulfill({
          userId,
          transactionId,
          originalTransactionId: originalId,
          productId,
          environment: transaction?.environment ?? notification.data?.environment ?? null,
          expiresAt: deps.msToIso(transaction?.expiresDate),
          appAccountToken: transaction?.appAccountToken ?? null,
          purchasedAt: deps.msToIso(transaction?.purchaseDate),
          raw: { notificationType: type, subtype, ...(transaction ?? {}) },
        });
        break;
      }
      case "DID_FAIL_TO_RENEW":
      case "GRACE_PERIOD_EXPIRED":
      case "EXPIRED": {
        if (!originalId) throw new Error("missing originalTransactionId for expire");
        await deps.expire(originalId);
        break;
      }
      case "REFUND":
      case "REVOKE": {
        if (!transactionId) throw new Error("missing transactionId for refund");
        await deps.revoke(transactionId, type.toLowerCase());
        break;
      }
      case "DID_CHANGE_RENEWAL_STATUS":
      case "CONSUMPTION_REQUEST":
      case "PRICE_INCREASE":
      case "REFUND_DECLINED":
      case "RENEWAL_EXTENDED":
      case "RENEWAL_EXTENSION":
        // Informational — acknowledge without mutating entitlements.
        break;
      default:
        console.warn("Unhandled App Store notification type", type, subtype);
    }

    await deps.complete(uuid);
    return { status: 200, body: { ok: true, type, subtype } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.fail(uuid, message);
    console.error("appstore-notifications handler", message);
    // Return 500 so Apple retries (except permanent claim failures already handled).
    return { status: 500, body: { error: message } };
  }
}
