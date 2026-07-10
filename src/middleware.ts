import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Define dashboard routes for each role
const DASHBOARD_ROUTE: Record<string, string> = {
  SUPER_ADMIN: "/super-admin",
  OWNER: "/admin",
  ADMIN: "/dashboard",
  CAMPUS_REPRESENTATIVE: "/campus-rep-dashboard",
  TEACHER: "/teacher",
  VOLUNTEER: "/volunteer",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/") {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      // Unauthenticated: redirect to /login
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Authenticated: redirect to their dashboard
    const role = token?.role;
    const dashboard = DASHBOARD_ROUTE[role as string];
    if (dashboard) {
      return NextResponse.redirect(new URL(dashboard, req.url));
    }
    // Unknown role: fallback to login
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"], // Only apply to the home page
};
