/**
 * App Store Server API / Notifications V2 helpers.
 * Verifies Apple-signed JWS via full x5c chain to the pinned Apple Root CA G3.
 */
import { importX509, jwtVerify, decodeProtectedHeader, decodeJwt } from "npm:jose@5.9.6";
import * as x509 from "npm:@peculiar/x509@1.12.3";
import {
  HttpError,
  requireEnv,
  restRpc,
} from "./stripeBilling.ts";
import {
  APPLE_INTERMEDIATE_OID,
  APPLE_LEAF_OID,
  APPLE_ROOT_CA_G3_PEM,
} from "./appleRootCaG3.ts";

const EXPECTED_BUNDLE_ID = () =>
  (Deno.env.get("APPSTORE_BUNDLE_ID") ?? "net.toova.app").trim();

export type AppStoreTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  bundleId?: string;
  environment?: string;
  expiresDate?: number;
  purchaseDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  type?: string;
  transactionReason?: string;
};

export type AppStoreNotificationPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    bundleId?: string;
    environment?: string;
  };
  version?: string;
  signedDate?: number;
};

export type VerifyAppStoreJwsOptions = {
  /** Override pinned root (tests only). */
  trustedRootPem?: string;
  /** Override expected bundle id check. */
  expectedBundleId?: string;
  /** Skip bundleId requirement (notification outer envelope may omit it). */
  requireBundleId?: boolean;
};

function pemFromX5c(derB64: string): string {
  const lines = derB64.match(/.{1,64}/g) ?? [derB64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

function derFromX5c(derB64: string): Uint8Array {
  const bin = atob(derB64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isLocalSupabaseUrl(url = Deno.env.get("SUPABASE_URL") ?? ""): boolean {
  const lower = url.toLowerCase();
  return lower.includes("localhost") || lower.includes("127.0.0.1");
}

/** Skip verify only for local Supabase when explicitly opted in. */
export function allowSkipJwsVerify(): boolean {
  return Deno.env.get("APPSTORE_SKIP_JWS_VERIFY") === "1" && isLocalSupabaseUrl();
}

function hasOid(cert: x509.X509Certificate, oid: string): boolean {
  return cert.extensions.some((ext) => ext.type === oid);
}

function assertValidity(cert: x509.X509Certificate, label: string, now: Date): void {
  if (now < cert.notBefore || now > cert.notAfter) {
    throw new HttpError(400, `${label} certificate is expired or not yet valid.`);
  }
}

/**
 * Verify x5c chain: leaf ← intermediate ← pinned Apple Root CA G3.
 * Checks validity windows and Apple-specific OIDs.
 * Returns the leaf PEM for JWT signature verification.
 */
export async function verifyAppleX5cChain(
  x5c: string[],
  trustedRootPem = APPLE_ROOT_CA_G3_PEM,
): Promise<string> {
  if (!Array.isArray(x5c) || x5c.length < 2 || typeof x5c[0] !== "string" || typeof x5c[1] !== "string") {
    throw new HttpError(400, "Incomplete App Store x5c chain.");
  }

  const leaf = new x509.X509Certificate(derFromX5c(x5c[0]));
  const intermediate = new x509.X509Certificate(derFromX5c(x5c[1]));
  const root = new x509.X509Certificate(trustedRootPem);
  const now = new Date();

  assertValidity(leaf, "Leaf", now);
  assertValidity(intermediate, "Intermediate", now);
  assertValidity(root, "Root", now);

  if (!hasOid(leaf, APPLE_LEAF_OID)) {
    throw new HttpError(400, "Leaf certificate missing Apple App Store OID.");
  }
  if (!hasOid(intermediate, APPLE_INTERMEDIATE_OID)) {
    throw new HttpError(400, "Intermediate certificate missing Apple WWDR OID.");
  }

  const leafOk = await leaf.verify({ publicKey: await intermediate.publicKey, date: now });
  if (!leafOk) {
    throw new HttpError(400, "Leaf certificate is not signed by the intermediate.");
  }

  const intermediateOk = await intermediate.verify({ publicKey: await root.publicKey, date: now });
  if (!intermediateOk) {
    throw new HttpError(400, "Intermediate certificate is not signed by Apple Root CA G3.");
  }

  // If Apple included the root in x5c, it must match the pinned root.
  if (x5c.length >= 3 && typeof x5c[2] === "string") {
    const embeddedRoot = new x509.X509Certificate(derFromX5c(x5c[2]));
    const a = new Uint8Array(embeddedRoot.rawData);
    const b = new Uint8Array(root.rawData);
    if (a.length !== b.length || !a.every((v, i) => v === b[i])) {
      throw new HttpError(400, "Embedded root does not match pinned Apple Root CA G3.");
    }
  }

  return pemFromX5c(x5c[0]);
}

function assertExpectedBundleId(
  bundleId: string | undefined,
  expected: string,
  requireBundleId: boolean,
): void {
  const trimmed = bundleId?.trim();
  if (!trimmed) {
    if (requireBundleId) {
      throw new HttpError(400, "Missing bundleId.");
    }
    return;
  }
  if (trimmed !== expected) {
    throw new HttpError(400, `Unexpected bundleId ${trimmed}`);
  }
}

/** Verify Apple-signed JWS and return decoded payload. */
export async function verifyAppStoreJws<T extends Record<string, unknown>>(
  token: string,
  options: VerifyAppStoreJwsOptions = {},
): Promise<T> {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    throw new HttpError(400, "Invalid JWS.");
  }

  const header = decodeProtectedHeader(token);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length === 0 || typeof x5c[0] !== "string") {
    throw new HttpError(400, "JWS missing x5c header.");
  }

  const leafPem = await verifyAppleX5cChain(
    x5c as string[],
    options.trustedRootPem ?? APPLE_ROOT_CA_G3_PEM,
  );
  const key = await importX509(leafPem, header.alg ?? "ES256");
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["ES256"],
  });

  const requireBundleId = options.requireBundleId ?? true;
  const expected = options.expectedBundleId ?? EXPECTED_BUNDLE_ID();
  const bundleId = typeof payload.bundleId === "string"
    ? payload.bundleId
    : typeof (payload as { data?: { bundleId?: string } }).data?.bundleId === "string"
    ? (payload as { data: { bundleId: string } }).data.bundleId
    : undefined;
  assertExpectedBundleId(bundleId, expected, requireBundleId);

  return payload as T;
}

/** Decode without verify — only for local StoreKit / tests when allowSkipJwsVerify(). */
export function decodeAppStoreJwsUnsafe<T extends Record<string, unknown>>(
  token: string,
): T {
  return decodeJwt(token) as T;
}

export async function parseTransactionInfo(
  signedTransactionInfo: string,
  options: VerifyAppStoreJwsOptions = {},
): Promise<AppStoreTransactionPayload> {
  const payload = allowSkipJwsVerify()
    ? decodeAppStoreJwsUnsafe<AppStoreTransactionPayload>(signedTransactionInfo)
    : await verifyAppStoreJws<AppStoreTransactionPayload>(signedTransactionInfo, {
      ...options,
      requireBundleId: true,
    });

  assertExpectedBundleId(
    payload.bundleId,
    options.expectedBundleId ?? EXPECTED_BUNDLE_ID(),
    true,
  );
  return payload;
}

export async function parseNotificationPayload(
  signedPayload: string,
  options: VerifyAppStoreJwsOptions = {},
): Promise<{
  notification: AppStoreNotificationPayload;
  transaction: AppStoreTransactionPayload | null;
}> {
  const notification = allowSkipJwsVerify()
    ? decodeAppStoreJwsUnsafe<AppStoreNotificationPayload>(signedPayload)
    : await verifyAppStoreJws<AppStoreNotificationPayload>(signedPayload, {
      ...options,
      // Outer notification may put bundleId under data.
      requireBundleId: false,
    });

  const dataBundle = notification.data?.bundleId?.trim();
  if (dataBundle) {
    assertExpectedBundleId(
      dataBundle,
      options.expectedBundleId ?? EXPECTED_BUNDLE_ID(),
      true,
    );
  }

  const signedTxn = notification.data?.signedTransactionInfo;
  let transaction: AppStoreTransactionPayload | null = null;
  if (signedTxn) {
    transaction = await parseTransactionInfo(signedTxn, options);
  }
  return { notification, transaction };
}

export function msToIso(ms: number | undefined | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export type ClaimAppStoreNotificationResult = {
  ok: boolean;
  claimed?: boolean;
  duplicate?: boolean;
  in_flight?: boolean;
  retried?: boolean;
  status?: string;
};

export async function claimAppStoreNotification(
  notificationUuid: string,
  notificationType: string,
  subtype?: string | null,
): Promise<ClaimAppStoreNotificationResult> {
  const result = await restRpc("claim_appstore_notification", {
    p_notification_uuid: notificationUuid,
    p_notification_type: notificationType,
    p_subtype: subtype ?? null,
  }) as ClaimAppStoreNotificationResult;
  if (!result?.ok) {
    throw new Error(`claim_appstore_notification failed: ${JSON.stringify(result)}`);
  }
  return result;
}

export async function completeAppStoreNotification(notificationUuid: string): Promise<void> {
  const result = await restRpc("complete_appstore_notification", {
    p_notification_uuid: notificationUuid,
  }) as { ok?: boolean; error?: string };
  if (!result?.ok) {
    throw new Error(`complete_appstore_notification failed: ${result?.error ?? "unknown"}`);
  }
}

export async function failAppStoreNotification(
  notificationUuid: string,
  errorMessage: string,
): Promise<void> {
  try {
    await restRpc("fail_appstore_notification", {
      p_notification_uuid: notificationUuid,
      p_error: errorMessage.slice(0, 2000),
    });
  } catch (err) {
    console.error("fail_appstore_notification", err);
  }
}

export async function fulfillTransaction(input: {
  userId: string;
  transactionId: string;
  originalTransactionId?: string | null;
  productId: string;
  environment?: string | null;
  expiresAt?: string | null;
  appAccountToken?: string | null;
  purchasedAt?: string | null;
  raw?: Record<string, unknown> | null;
}): Promise<Record<string, unknown>> {
  const result = await restRpc("appstore_fulfill_transaction", {
    p_uid: input.userId,
    p_transaction_id: input.transactionId,
    p_original_transaction_id: input.originalTransactionId ?? input.transactionId,
    p_product_id: input.productId,
    p_environment: input.environment ?? null,
    p_expires_at: input.expiresAt ?? null,
    p_app_account_token: input.appAccountToken ?? null,
    p_purchased_at: input.purchasedAt ?? null,
    p_raw: input.raw ?? null,
  }) as Record<string, unknown>;
  return result;
}

export async function revokeTransaction(
  transactionId: string,
  reason = "refund",
): Promise<Record<string, unknown>> {
  return await restRpc("appstore_revoke_transaction", {
    p_transaction_id: transactionId,
    p_reason: reason,
  }) as Record<string, unknown>;
}

export async function expireSubscription(
  originalTransactionId: string,
): Promise<Record<string, unknown>> {
  return await restRpc("appstore_expire_subscription", {
    p_original_transaction_id: originalTransactionId,
  }) as Record<string, unknown>;
}

export async function userForOriginalTxn(
  originalTransactionId: string,
): Promise<string | null> {
  const result = await restRpc("appstore_user_for_original_txn", {
    p_original_transaction_id: originalTransactionId,
  });
  return typeof result === "string" ? result : null;
}

export function requireAppStoreBundleId(): string {
  return requireEnv("APPSTORE_BUNDLE_ID");
}

/** Require appAccountToken to match the authenticated user id. */
export function assertAppAccountTokenMatchesUser(
  appAccountToken: string | undefined | null,
  userId: string,
): void {
  const token = appAccountToken?.trim().toLowerCase() ?? "";
  if (!token) {
    throw new HttpError(400, "Missing appAccountToken.");
  }
  if (token !== userId.trim().toLowerCase()) {
    throw new HttpError(403, "Purchase is not linked to this account.");
  }
}
