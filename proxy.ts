import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTE_PREFIXES = [
  "/_next",
  "/api/auth",
  "/api/stripe/webhook",
  "/auth/callback",
  "/s/",
  "/uploads/",
];

const PUBLIC_ROUTES = new Set(["/auth", "/favicon.ico"]);

const hasFileExtension = (pathname: string) => /\.[^/]+$/.test(pathname);

const isPublicRoute = (pathname: string) => {
  if (PUBLIC_ROUTES.has(pathname)) {
    return true;
  }

  if (hasFileExtension(pathname)) {
    return true;
  }

  return PUBLIC_ROUTE_PREFIXES.some((routePrefix) =>
    pathname.startsWith(routePrefix),
  );
};

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionToken = getSessionCookie(request.headers);
  const isAuthenticated = Boolean(sessionToken);

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/auth", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
