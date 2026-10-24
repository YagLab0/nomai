import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });
  /** Auth cookies touched during this request — flushed onto the final response. */
  const authCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          authCookies.push(...cookiesToSet);
        },
      },
    }
  );

  // Refresh the session if expired. getUser() revalidates the token against
  // the Auth server; getSession() does not.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = pathname === "/app" || pathname.startsWith("/app/");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  // Unauthenticated → /app/* bounces to /login, remembering the destination.
  if (!user && isProtected) {
    const loginUrl = new URL("/login", request.url);
    const destination = pathname + (request.nextUrl.search || "");
    loginUrl.searchParams.set("next", destination);
    const redirectResponse = NextResponse.redirect(loginUrl);
    authCookies.forEach(({ name, value, options }) => redirectResponse.cookies.set(name, value, options));
    return redirectResponse;
  }

  // Authenticated → /login and /signup bounce to /app.
  if (user && isAuthRoute) {
    const redirectResponse = NextResponse.redirect(new URL("/app", request.url));
    authCookies.forEach(({ name, value, options }) => redirectResponse.cookies.set(name, value, options));
    return redirectResponse;
  }

  authCookies.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
  return supabaseResponse;
}
