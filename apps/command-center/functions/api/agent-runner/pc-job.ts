import type { Env, ApiData } from "../../lib/env";
import type { PcJobBody } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { pcJob, refused } from "../../lib/agentPcJobs";

// POST /api/agent-runner/pc-job  body PcJobBody -> { job: PcJob | null }
//
// The VPS runner's Ads turn queues clip video work for the PC and polls it;
// the PC runner claims it and reports back (lib/agentPcJobs.ts has the rules).

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const body = (await ctx.request.json().catch(() => null)) as Partial<PcJobBody> | null;
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const out = await pcJob(client, body);
  if (refused(out)) return Response.json({ error: out.error }, { status: out.status });
  return Response.json(out);
};
