import { NextRequest, NextResponse } from "next/server";
import { verifyAdminToken } from "@/lib/auth";
import { redis } from "@/lib/kv";
import { getZipMap, ZIP_MAP_KEY } from "@/lib/neighborhoods";

export async function GET() {
  return NextResponse.json({ map: await getZipMap() });
}

export async function POST(req: NextRequest) {
  if (!verifyAdminToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const input = body?.map;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const map: Record<string, string> = {};
    for (const [zip, hood] of Object.entries(input)) {
      if (/^\d{5}$/.test(zip) && typeof hood === "string" && hood.trim()) {
        map[zip] = hood.trim();
      }
    }

    await redis.set(ZIP_MAP_KEY, map);
    return NextResponse.json({ map });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
