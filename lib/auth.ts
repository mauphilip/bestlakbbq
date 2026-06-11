// Admin auth: HMAC-signed bearer tokens with expiry, keyed off ADMIN_PIN.
// Token = "v1.<base64url(payload)>.<base64url(hmacSHA256(payload))>".
// ADMIN_PIN can be any length — use a long passphrase. If it's unset, auth always fails
// (no "0000" fallback).

import { createHmac, createHash, timingSafeEqual } from "crypto";

const SECRET = process.env.ADMIN_PIN ?? "";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hmac(payload: string): Buffer {
  return createHmac("sha256", SECRET).update(payload).digest();
}

/** Constant-time string compare via hashing (no length leak on early return). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** True when the submitted PIN/passphrase matches ADMIN_PIN. */
export function verifyPin(pin: unknown): boolean {
  if (typeof pin !== "string" || !pin || !SECRET) return false;
  return safeEqual(pin, SECRET);
}

export function issueAdminToken(now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + TOKEN_TTL_MS })).toString("base64url");
  return `v1.${payload}.${hmac(payload).toString("base64url")}`;
}

export function verifyAdminToken(req: Request): boolean {
  if (!SECRET) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, payload, sig] = parts;

  const expected = hmac(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}
