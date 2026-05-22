import type { Env } from "../../lib/env";
import { verifySession } from "../../lib/session";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const ok = await verifySession(ctx.request, ctx.env);
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true });
};
