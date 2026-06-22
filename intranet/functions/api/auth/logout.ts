import type { Env } from "../../lib/env";
import { clearSessionCookie } from "../../lib/session";

// POST /api/auth/logout  (public) — clears the session cookie.
export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearSessionCookie() },
  });
};
