import type { Env, ApiData } from "../lib/env";
import { ghlJson } from "../lib/ghl";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string; position: number; color?: string }[];
  }[];
}

export interface ApiPipelineSummary {
  id: string;
  name: string;
  // `color` is the per-stage hex GHL stores (e.g. "#F97316"), so the app can
  // paint each stage in the same colour the client sees inside GHL.
  stages: { id: string; name: string; color?: string }[];
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

// All pipelines for the tenant, each with its real, ordered stage list.
// The sole source of stage names/ids for the frontend; the old singular
// /api/pipeline (pipelines[0] only) was removed in Part 3.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const cacheKey = `pipelines:${t.ghl_location_id}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return Response.json(hit.data);
  }

  const data = await ghlJson<PipelinesResponse>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );

  const pipelines: ApiPipelineSummary[] = (data.pipelines ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stages: [...(p.stages ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, name: s.name, color: s.color })),
  }));

  const result = { pipelines };
  cache.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS });
  return Response.json(result);
};
