import type { Env } from "../../lib/env";
import { mintSessionCookie } from "../../lib/session";

interface Body {
  password?: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const expected = ctx.env.APP_PASSWORD;
  if (!expected) {
    return Response.json(
      { error: "APP_PASSWORD not configured" },
      { status: 500 },
    );
  }
  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const supplied = (body.password ?? "").trim();
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return Response.json({ error: "incorrect password" }, { status: 401 });
  }
  const cookie = await mintSessionCookie(ctx.env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookie,
    },
  });
};
