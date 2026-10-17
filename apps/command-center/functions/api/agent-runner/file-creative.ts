import type { Env, ApiData } from "../../lib/env";
import type { FileCreativeBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { recordAdCreative } from "../../lib/adCreativeFiles";
import { creativeTurn, fileGrantFor } from "../../lib/agentCreative";

// POST /api/agent-runner/file-creative  body FileCreativeBody -> { ok: true }
//
// Files a Creative Agent upload into the client's Creatives (Paid Ads), the
// same row the admin upload makes. Only on the turn that answers Jake's
// Approve on the card for exactly this file: the grant is checked here, on
// the server, not trusted from the runner (lib/agentCreative.ts).

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as Partial<FileCreativeBody> | null;
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const turn = await creativeTurn(client, body?.messageId, body?.tenantId);
  if ("error" in turn) return Response.json({ error: turn.error }, { status: turn.status });
  const refused = await fileGrantFor(client, turn, body?.path);
  if (refused) return Response.json({ error: refused.error }, { status: refused.status });

  const res = await recordAdCreative(client, turn.tenantId, {
    path: body!.path,
    name: body!.name,
    type: body!.type,
    size: body!.size,
  });
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json({ ok: true });
};
