import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

// Optimistic check only: redirects visitors without a session cookie before
// rendering. It doesn't touch the database, so pages and Server Actions
// still verify the session themselves (see src/server/auth.ts).
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/profile/:path*",
    "/convert/:path*",
    "/transfer/:path*",
    "/admin/:path*",
  ],
};
