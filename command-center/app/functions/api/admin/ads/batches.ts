import type { Env, ApiData } from "../../../lib/env";
import { getServiceClient } from "../../../lib/supabase";
import {
  AD_BATCH_SELECT,
  isAdBatchKind,
  toAdBatch,
  type AdBatchRow,
} from "../../../lib/adBatches";

// The ad builder's list and create (0088).
//
//   GET  /api/admin/ads/batches?tenantId=...&kind=static
//        -> { batches: [...] }   one kind, newest first
//   GET  /api/admin/ads/batches?tenantId=...
//        -> { batches: [...] }   BOTH kinds, newest first. This is Master.
//   POST /api/admin/ads/batches  { tenantId, kind }
//        -> { batch }            an empty batch, named later
//
// Admin-only: gated centrally in api/_middleware.ts, and owners pass everything
// there. This must never become client-reachable. It holds competitor research
// and copy that has not launched.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const url = new URL(ctx.request.url);
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  // Absent means "both", which is what Master asks for. A kind that is present
  // but unrecognised is a typo in a hand-written URL, and answering it with the
  // whole list would quietly show video batches on the static page.
  const kindParam = url.searchParams.get("kind");
  if (kindParam !== null && !isAdBatchKind(kindParam)) {
    return Response.json({ error: "unknown kind" }, { status: 400 });
  }

  let query = client
    .from("ad_batches")
    .select(AD_BATCH_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (kindParam) query = query.eq("kind", kindParam);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const batches = ((data ?? []) as unknown as AdBatchRow[]).map(toAdBatch);
  return Response.json({ batches });
};

interface CreateBody {
  tenantId?: string;
  kind?: string;
}

// Creating a batch takes no content. Pressing New puts an empty, open card on
// the page and the writing happens in it; asking for a title in a dialog first
// would mean naming the round before knowing what it is.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  let body: CreateBody = {};
  try {
    body = (await ctx.request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const tenantId = (body.tenantId ?? "").trim();
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (!isAdBatchKind(body.kind)) {
    return Response.json({ error: "kind must be static or video" }, { status: 400 });
  }

  const { data, error } = await client
    .from("ad_batches")
    .insert({ tenant_id: tenantId, kind: body.kind })
    .select(AD_BATCH_SELECT)
    .single();

  if (error || !data) {
    return Response.json(
      { error: error?.message ?? "could not create batch" },
      { status: 500 },
    );
  }

  return Response.json({ batch: toAdBatch(data as unknown as AdBatchRow) }, { status: 201 });
};
