import type { Env } from "../../lib/env";
import { mintSessionCookie, type SessionMode } from "../../lib/session";

interface Body {
  password?: string;
  mode?: SessionMode;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: Body = {};
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const supplied = (body.password ?? "").trim();
  if (!supplied) {
    return Response.json({ error: "incorrect password" }, { status: 401 });
  }

  let mode: SessionMode;
  if (body.mode === "test") {
    const testPassword = ctx.env.TEST_APP_PASSWORD;
    if (!testPassword) {
      return Response.json(
        { error: "TEST_APP_PASSWORD not configured" },
        { status: 500 },
      );
    }
    if (!constantTimeEqual(supplied, testPassword)) {
      return Response.json({ error: "incorrect password" }, { status: 401 });
    }
    mode = "test";
  } else {
    const livePassword = ctx.env.APP_PASSWORD;
    if (!livePassword) {
      return Response.json(
        { error: "APP_PASSWORD not configured" },
        { status: 500 },
      );
    }
    if (!constantTimeEqual(supplied, livePassword)) {
      return Response.json({ error: "incorrect password" }, { status: 401 });
    }
    mode = "live";
  }

  const cookie = await mintSessionCookie(ctx.env, mode);
  return new Response(JSON.stringify({ ok: true, mode }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookie,
    },
  });
};
