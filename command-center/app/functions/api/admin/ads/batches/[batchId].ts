import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import {
  AD_BATCH_SELECT,
  patchColumns,
  toAdBatch,
  type AdBatchPatch,
  type AdBatchRow,
} from "../../../../lib/adBatches";

// One ad batch (0088).
//
//   PATCH  /api/admin/ads/batches/:batchId   { any subset of the fields }
//   DELETE /api/admin/ads/batches/:batchId
//
// The form saves a field when it is left, so a PATCH normally carries exactly
// one key. Only the keys present are written; an absent key is untouched rather
// than blanked, which is what lets two fields be edited without one save
// stamping over the other.
//
// `kind` is deliberately not patchable. A static batch has no hook and no
// script, and turning one into a video would leave a row whose two most
// important fields were never written. Make a video batch instead.
//
// Admin-only: gated centrally in api/_middleware.ts.

export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const batchId = ctx.params.batchId as string;

  let body: AdBatchPatch = {};
  try {
    body = (await ctx.request.json()) as AdBatchPatch;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const update = patchColumns(body);
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from("ad_batches")
    .update(update)
    .eq("id", batchId)
    .select(AD_BATCH_SELECT)
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message ?? "batch not found" }, { status: 404 });
  }

  return Response.json({ batch: toAdBatch(data as unknown as AdBatchRow) });
};

// Irreversible, and the panel confirms before calling. There is no archive
// flag: unlike a playbook prompt, a discarded round of copy that was never
// launched is not evidence of anything, and a list of drafts nobody wants is
// what makes a drafting table unusable.
export const onRequestDelete: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const batchId = ctx.params.batchId as string;
  const { error } = await client.from("ad_batches").delete().eq("id", batchId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
};
