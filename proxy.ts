import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export default async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const res = NextResponse.next();

  const hasAuthParams =
    searchParams.has("code") ||
    searchParams.has("token") ||
    searchParams.has("access_token") ||
    searchParams.has("refresh_token") ||
    searchParams.has("type");

  const isAuthCallback = pathname.startsWith("/auth/callback");
  const isSetPassword = pathname.startsWith("/set-password");
  const isShareRoute = pathname.startsWith("/share") || pathname.startsWith("/api/share");

  if (hasAuthParams && !isAuthCallback && !isSetPassword && !isShareRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/callback";

    if (!url.searchParams.has("redirect_to")) {
      const redirectParam = url.searchParams.get("redirect");
      if (redirectParam) {
        let decoded = redirectParam;
        try {
          decoded = decodeURIComponent(redirectParam);
        } catch {}
        const hasAuthInRedirect = /(code=|access_token=|refresh_token=|token=)/.test(decoded);
        url.searchParams.set("redirect_to", hasAuthInRedirect ? "/set-password" : decoded);
      } else if (url.searchParams.get("type") === "recovery") {
        url.searchParams.set("redirect_to", "/set-password");
      } else if (url.searchParams.has("code")) {
        url.searchParams.set("redirect_to", "/set-password");
      }
    }

    return NextResponse.redirect(url);
  }

  const supabase = createMiddlewareClient({ req, res });
  const { data, error: sessionError } = await supabase.auth.getSession();
  const session = data.session;

  const isRefreshTokenNotFound = (error: unknown) => {
    const code = (error as any)?.code;
    if (code === "refresh_token_not_found") return true;
    const message = String((error as any)?.message ?? "");
    return /refresh token not found/i.test(message);
  };

  const clearSupabaseCookies = () => {
    const supabaseCookies = req.cookies.getAll().filter((c) => c.name.startsWith("sb-"));
    for (const cookie of supabaseCookies) {
      res.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  };

  if (sessionError) {
    if (isRefreshTokenNotFound(sessionError)) {
      clearSupabaseCookies();
    } else {
      console.warn("[proxy] getSession error", {
        code: (sessionError as any)?.code ?? null,
        message: sessionError.message,
      });
    }
  }

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/reset") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/share") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/assets");

  if (isPublic) return res;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "redirect",
      pathname + (searchParams.toString() ? `?${searchParams}` : ""),
    );
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
