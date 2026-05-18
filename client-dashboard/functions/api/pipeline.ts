import type { Env, ApiData } from "../lib/env";
import { ghlJson } from "../lib/ghl";

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string; position: number }[];
  }[];
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const cacheKey = `pipeline:${t.ghl_location_id}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return Response.json(hit.data);
  }

  const data = await ghlJson<PipelinesResponse>(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );

  const pipeline = data.pipelines?.[0];
  const result = pipeline
    ? {
        pipelineId: pipeline.id,
        name: pipeline.name,
        stages: [...pipeline.stages]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ id: s.id, name: s.name })),
      }
    : { pipelineId: null, name: null, stages: [] };

  cache.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS });
  return Response.json(result);
};
