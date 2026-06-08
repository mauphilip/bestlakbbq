import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;

  // socal.food → serve /collections as the root
  if (host.includes("socal.food")) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/collections", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
