import { NextRequest, NextResponse } from "next/server";
import { verifyPin, issueAdminToken } from "@/lib/auth";
import { redis } from "@/lib/kv";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 900; // 15 min lockout window per IP

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const failKey = `kbbq_auth_fail_${ip}`;

  // Lockout check (non-fatal if KV is down — auth still requires the correct PIN)
  try {
    const fails = await redis.get<number>(failKey);
    if (fails !== null && fails >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }
  } catch { /* KV unavailable */ }

  const body = await req.json().catch(() => null);
  if (!verifyPin(body?.pin)) {
    try {
      const fails = await redis.incr(failKey);
      if (fails === 1) await redis.expire(failKey, WINDOW_SECONDS);
    } catch { /* non-fatal */ }
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  try { await redis.del(failKey); } catch { /* non-fatal */ }
  return NextResponse.json({ token: issueAdminToken() });
}
