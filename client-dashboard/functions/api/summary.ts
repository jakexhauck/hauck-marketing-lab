import type { Env, ApiData } from "../lib/env";
import { ghlJson, type GhlOpportunity } from "../lib/ghl";

interface SearchResponse {
  opportunities: GhlOpportunity[];
  meta?: { total?: number };
}

interface PipelinesResponse {
  pipelines: { id: string; name: string }[];
}

interface ConvSearchResponse {
  conversations?: { unreadCount?: number }[];
}

export interface PipelineSummary {
  id: string;
  name: string;
  total: number; // opportunities in this pipeline (from the fetched page)
  open: number; // status === "open"
}

export interface ApiSummary {
  pipelines: PipelineSummary[];
  newToday: number; // opportunities created today, all pipelines
  unreadConversations: number;
}

function startOfTodayMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// One screen of cross-pipeline counts for the Home dashboard.
// Pulls the pipeline list (for names/order) and one page of opportunities,
// then groups client-side. Cheap: two GHL calls plus a conversations probe.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  const [pipelinesData, oppData] = await Promise.all([
    ghlJson<PipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
    ),
    ghlJson<SearchResponse>(
      gctx,
      `/opportunities/search?location_id=${encodeURIComponent(t.ghl_location_id)}&limit=100`,
    ),
  ]);

  const opps = oppData.opportunities ?? [];
  const todayMs = startOfTodayMs();

  const byPipeline = new Map<string, { total: number; open: number }>();
  let newToday = 0;
  for (const o of opps) {
    const pid = o.pipelineId ?? "";
    const entry = byPipeline.get(pid) ?? { total: 0, open: 0 };
    entry.total += 1;
    if ((o.status ?? "open") === "open") entry.open += 1;
    byPipeline.set(pid, entry);

    const created = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
    if (Number.isFinite(created) && created >= todayMs) newToday += 1;
  }

  const pipelines: PipelineSummary[] = (pipelinesData.pipelines ?? []).map(
    (p) => {
      const c = byPipeline.get(p.id) ?? { total: 0, open: 0 };
      return { id: p.id, name: p.name, total: c.total, open: c.open };
    },
  );

  let unreadConversations = 0;
  try {
    const conv = await ghlJson<ConvSearchResponse>(
      gctx,
      `/conversations/search?locationId=${encodeURIComponent(t.ghl_location_id)}&limit=100&sort=desc&sortBy=last_message_date`,
    );
    unreadConversations = (conv.conversations ?? []).reduce(
      (sum, c) => sum + (c.unreadCount ?? 0),
      0,
    );
  } catch {
    unreadConversations = 0;
  }

  const result: ApiSummary = { pipelines, newToday, unreadConversations };
  return Response.json(result);
};
