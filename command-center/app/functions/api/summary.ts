import { tenantTimezone, type Env, type ApiData } from "../lib/env";
import { fetchAllConversations, fetchAllOpportunities, ghlJson } from "../lib/ghl";
import { startOfTodayMs } from "../lib/tz";

interface PipelinesResponse {
  pipelines: { id: string; name: string }[];
}

export interface PipelineSummary {
  id: string;
  name: string;
  total: number; // opportunities in this pipeline
  open: number; // status === "open"
}

export interface ApiSummary {
  pipelines: PipelineSummary[];
  newToday: number; // opportunities created today, all pipelines
  unreadConversations: number;
}

// Cross-pipeline counts for the Home dashboard. Pulls the pipeline list (for
// names/order) and every opportunity (paginated, shared helper), then groups
// client-side, so counts are accurate past the first page.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  const [pipelinesData, opps] = await Promise.all([
    ghlJson<PipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
    ),
    fetchAllOpportunities(gctx),
  ]);

  const todayMs = startOfTodayMs(tenantTimezone(ctx.env));

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
    // Paginated across every conversation (shared helper), so the unread badge
    // is not capped at the first 100 conversations.
    const convs = await fetchAllConversations(gctx);
    unreadConversations = convs.reduce(
      (sum, c) => sum + (c.unreadCount ?? 0),
      0,
    );
  } catch {
    unreadConversations = 0;
  }

  const result: ApiSummary = { pipelines, newToday, unreadConversations };
  return Response.json(result);
};
