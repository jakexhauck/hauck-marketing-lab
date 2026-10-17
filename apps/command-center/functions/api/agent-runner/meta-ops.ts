import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { callMetaOp, type MetaCallBody } from "../../lib/agentMetaOps";
import { resolveMetaToken } from "../../lib/metaToken";
import { AD_CREATIVES_BUCKET } from "../../lib/adCreativeFiles";

// POST /api/agent-runner/meta-ops  { messageId, tenantId, op, args } -> { op, result }
//
// The Ads Agent's only way to change a client's Ads Manager (the runner's
// bin/metaops.mjs calls this). Every rule lives in lib/agentMetaOps.ts: the
// op allowlist, the "running Ads Agent turn at this client" check, the
// approved meta grant with the exact op on the card (no direct ask), the live
// account, name and budget checks, the budget guard, and the audit row before
// each write. This file only wires HTTP, the agency System User token and the
// Creatives bucket. The insights reads stay in meta.ts, which imports none of
// this.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: MetaCallBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await callMetaOp(client, body, {
    token: () => resolveMetaToken(ctx.env),
    download: async (path) => {
      const { data, error } = await client.storage.from(AD_CREATIVES_BUCKET).download(path);
      if (error || !data) throw new Error(`could not read the Creatives file: ${error?.message ?? "missing"}`);
      return data;
    },
  });
  return Response.json(res.body, { status: res.status });
};
