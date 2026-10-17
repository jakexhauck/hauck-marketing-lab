import type { Env, ApiData } from "../../lib/env";
import type { ReadUrlBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { AD_CREATIVES_BUCKET } from "../../lib/adCreativeFiles";
import { creativeTurn, readablePath } from "../../lib/agentCreative";

// POST /api/agent-runner/read-url  body ReadUrlBody -> { url }
//
// A signed read URL for something the Creative Agent just uploaded, so its
// Building card can play the preview or show the final. A week, long enough
// for Jake to get to the card. Same turn check as upload-url, and only for a
// path under that client.

const READ_SECONDS = 7 * 24 * 60 * 60;

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as Partial<ReadUrlBody> | null;
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const turn = await creativeTurn(client, body?.messageId, body?.tenantId);
  if ("error" in turn) return Response.json({ error: turn.error }, { status: turn.status });
  if (!readablePath(body?.path, turn.tenantId)) return Response.json({ error: "invalid path" }, { status: 400 });

  const { data, error } = await client.storage.from(AD_CREATIVES_BUCKET).createSignedUrl(body!.path!, READ_SECONDS);
  if (error || !data) return Response.json({ error: error?.message ?? "could not sign" }, { status: 500 });
  return Response.json({ url: data.signedUrl });
};
