import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { callGhlOp, type GhlCallBody } from "../../lib/agentGhlOps";
import { getGhlContextForTenant } from "../../lib/tenantGhl";

// POST /api/agent-runner/ghl  { messageId, tenantId, op, args } -> { op, result }
//
// The GHL Agent's only way into a client's sub-account (the runner's
// bin/ghl.mjs calls this). Every rule lives in lib/agentGhlOps.ts: the op
// allowlist, the "running GHL Agent turn at this client" check, writeAllowed
// for writes, and the audit row before each write. This file only wires HTTP
// and the tenant's own GHL token. getGhlContextForTenant never falls back to
// another account's token, so a half-linked client is a refusal, not a write
// somewhere else.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: GhlCallBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await callGhlOp(client, body, { ghl: (tenantId) => getGhlContextForTenant(ctx.env, tenantId) });
  return Response.json(res.body, { status: res.status });
};
