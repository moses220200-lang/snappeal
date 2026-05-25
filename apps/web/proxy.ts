import { NextResponse, userAgent, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const ua = userAgent(request);
  if (ua.isBot) return NextResponse.next();
  if (ua.device.type === "mobile") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
