import { NextRequest, NextResponse } from "next/server";
import { ADMIN_TOKEN } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  if (pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }
  return NextResponse.json({ token: ADMIN_TOKEN });
}
