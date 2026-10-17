import type { Env, ApiData } from "../../lib/env";
import type { UploadUrlBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { AD_CREATIVES_BUCKET, checkUpload, newPath } from "../../lib/adCreativeFiles";
import { creativeTurn, previewPath, prunePreviews } from "../../lib/agentCreative";

// POST /api/agent-runner/upload-url  body UploadUrlBody -> { uploadUrl, path }
//
// A one-time signed upload URL into the ad-creatives bucket for the Creative
// Agent's render or image. Only while that agent's turn at that client is
// running (lib/agentCreative.ts). Signing files nothing: a final only shows
// in Creatives after Jake approves its card (file-creative).

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as Partial<UploadUrlBody> | null;
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const turn = await creativeTurn(client, body?.messageId, body?.tenantId);
  if ("error" in turn) return Response.json({ error: turn.error }, { status: turn.status });

  const check = checkUpload(body?.type, body?.size);
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });

  const preview = body?.preview === true;
  const path = preview ? previewPath(turn.tenantId, check.ext) : newPath(turn.tenantId, check.ext);
  // Old previews go as new ones arrive; a failed prune never blocks an upload.
  if (preview) await prunePreviews(client, turn.tenantId).catch(() => {});
  const { data, error } = await client.storage.from(AD_CREATIVES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: error?.message ?? "could not sign upload" }, { status: 500 });
  return Response.json({ uploadUrl: data.signedUrl, path });
};
