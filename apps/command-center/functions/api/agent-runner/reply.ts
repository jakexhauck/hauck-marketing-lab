import type { Env, ApiData } from "../../lib/env";
import type { ReplyBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { applyReply } from "../../lib/agentRunner";
import { trackTurn } from "../../lib/telegramManager";

// POST /api/agent-runner/reply  body ReplyBody -> { ok: true }
//
// Progress (status running) and the finished reply (done or error) for one
// claimed message. Every post rewrites the same paired ai message. See
// applyReply in lib/agentRunner.ts.
//
// A finished turn (done or error) also feeds the Telegram alert for an agent
// failing turns in a row, after the response. See lib/telegramManager.ts.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: ReplyBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await applyReply(client, body);
  if ("error" in res) {
    return Response.json({ error: res.error === 404 ? "message not found" : "bad reply" }, { status: res.error });
  }
  if (body.status === "done" || body.status === "error") {
    ctx.waitUntil(
      trackTurn(ctx.env, client, { messageId: body.messageId, status: body.status, error: body.error }).catch((err) =>
        console.error("[telegram] turn alert failed:", (err as Error).message),
      ),
    );
  }
  return Response.json(res);
};
