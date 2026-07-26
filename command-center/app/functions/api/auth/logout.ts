import type { Env } from "../../lib/env";
import { clearSessionCookie } from "../../lib/session";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": clearSessionCookie(ctx.request),
    },
  });
};
