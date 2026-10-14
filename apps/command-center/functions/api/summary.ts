import { tenantTimezone, type Env, type ApiData } from "../lib/env";
import {
  fetchAllConversations,
  fetchAllContacts,
  fetchAllOpportunities,
  ghlJson,
} from "../lib/ghl";
import { startOfTodayMs } from "../lib/tz";
import { makeInternalConversationFilter } from "../lib/internalRecipients";
import { clientVisiblePipelines } from "../lib/clientPipelines";

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

  // The agency's own "Cold Calling" board lives in the same location and must
  // never reach a client dashboard. Filtered here, on the server, so it is not
  // merely hidden in the UI: it never leaves the building.
  //
  // `newToday` above is deliberately still counted across every opportunity.
  // Scoping it would mean a client's "new leads today" silently disagreed with
  // their CRM, and the agency's prospects are not leads in their pipelines
  // anyway (they are contacts we sourced, on a board they cannot see).
  const pipelines: PipelineSummary[] = clientVisiblePipelines(
    pipelinesData.pipelines ?? [],
  ).map((p) => {
    const c = byPipeline.get(p.id) ?? { total: 0, open: 0 };
    return { id: p.id, name: p.name, total: c.total, open: c.open };
  });

  let unreadConversations = 0;
  try {
    // Paginated across every conversation (shared helper), so the unread badge
    // is not capped at the first 100 conversations. The contact roster comes
    // along only to identify internal notification sinks: their unread counts
    // must not inflate the client's badge. It degrades to an empty roster on
    // failure, which leaves the configured-recipient signal still working.
    const [convs, contacts] = await Promise.all([
      fetchAllConversations(gctx),
      fetchAllContacts(gctx).catch(() => []),
    ]);
    const isInternalConversation = makeInternalConversationFilter(
      contacts,
      t.internal_recipients,
    );
    unreadConversations = convs.reduce(
      (sum, c) => (isInternalConversation(c) ? sum : sum + (c.unreadCount ?? 0)),
      0,
    );
  } catch {
    unreadConversations = 0;
  }

  const result: ApiSummary = { pipelines, newToday, unreadConversations };
  return Response.json(result);
};
