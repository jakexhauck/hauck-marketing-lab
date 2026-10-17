import type { Env, ApiData } from "../../lib/env";
import type { FileAssetBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { fileLandingAsset } from "../../lib/agentFileAsset";

// POST /api/agent-runner/file-asset  body FileAssetBody -> { assetId, item }
//
// The runner has put an approved landing page live; this files it into
// Conversion Assets and marks the card live. Every check is on the server,
// against the database (lib/agentFileAsset.ts): a running Landing Page Agent
// message at this client carrying the deploy grant of an approved card, and a
// live URL on that card's own preview project. 403 for another agent's chat or
// client, 409 with no matching approved grant.

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  let body: FileAssetBody;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const res = await fileLandingAsset(client, body);
  if ("error" in res) return Response.json({ error: res.reason }, { status: res.error });
  return Response.json(res);
};
