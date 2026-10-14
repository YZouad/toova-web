/** Stripe webhook signature verification (Deno + Vitest). */

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function verifyStripeSignature(
  signatureHeader: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<unknown> {
  if (!signatureHeader) throw new Error("Missing stripe-signature");

  const parts = signatureHeader.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Parts = parts.filter((p) => p.startsWith("v1="));
  if (!tPart || v1Parts.length === 0) throw new Error("Invalid signature header");

  const timestamp = tPart.slice(2);
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) throw new Error("Invalid signature timestamp");
  if (Math.abs(nowSeconds - tsNum) > toleranceSeconds) {
    throw new Error("Signature timestamp outside tolerance");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expectedHex = [...new Uint8Array(expected)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const valid = v1Parts.some((p) => timingSafeEqual(p.slice(3), expectedHex));
  if (!valid) throw new Error("Signature verification failed");

  return JSON.parse(rawBody);
}
