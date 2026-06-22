import type { Env } from "./lib/env";
import { verifySession } from "./lib/session";

// Gate the whole site behind the admin session. Runs for every request (static
// assets included). Public: the login page, its CSS/logo, and the auth API.
// Everything else requires a valid admin session — HTML requests are redirected
// to /login.html, API requests get a 401.

// Cloudflare Pages serves HTML extensionless (/login.html -> /login via 308), so
// allow both forms to avoid a redirect loop on the sign-in page.
const PUBLIC_ASSETS = new Set<string>([
  "/login",
  "/login.html",
  "/app.css",
  "/logo.png",
  "/favicon.ico",
]);
const AUTH_API = new Set<string>([
  "/api/auth/admin-login",
  "/api/auth/logout",
  "/api/auth/me",
]);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const path = url.pathname;

  if (AUTH_API.has(path) || PUBLIC_ASSETS.has(path)) {
    return ctx.next();
  }

  const session = await verifySession(ctx.request, ctx.env);
  if (session?.adminId) {
    return ctx.next();
  }

  if (path.startsWith("/api/")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Unauthenticated page request → send to login (canonical extensionless path).
  return Response.redirect(`${url.origin}/login`, 302);
};
