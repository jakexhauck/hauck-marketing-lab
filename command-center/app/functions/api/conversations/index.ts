import type { Env, ApiData } from "../../lib/env";
import {
  fetchAllConversations,
  fetchAllContacts,
  fetchAllOpportunities,
  ghlJson,
} from "../../lib/ghl";
import {
  buildOpportunityIndex,
  buildPipelinePositions,
} from "../../lib/opportunityIndex";
import { classifyOrigin, normalizeChannel } from "../../lib/origin";
import type { OriginKey, ChannelKey } from "../../lib/origin";

export interface ConversationPipeline {
  pipelineId: string;
  pipelineStageId: string;
  pipelineName: string;
  stageName: string;
  status: string;
}

export interface ApiConversation {
  id: string;
  contactId: string;
  name: string;
  preview: string;
  lastMessageType: string;
  lastMessageAt: string;
  unreadCount: number;
  channel: ChannelKey;
  origin: OriginKey;
  source: string;
  firstTouchAt: string;
  // Pipeline position, joined from the lead's chosen GHL opportunity. Optional:
  // many conversations have no opportunity, in which case these are omitted and
  // the client buckets them under "New / Unsorted".
  pipelineId?: string;
  pipelineStageId?: string;
  pipelineName?: string;
  stageName?: string;
  // EVERY pipeline the contact sits in, not just the chosen one above. A past
  // customer holds a Sales position and a Google Reviews position at the same
  // time, so a page that needs one specific pipeline reads this. Empty when the
  // contact has no opportunity at all.
  pipelines: ConversationPipeline[];
}

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

function isSystemActivity(t?: string | number): boolean {
  if (typeof t !== "string" || !t) return false;
  const upper = t.toUpperCase();
  return upper.includes("ACTIVITY") || upper.includes("OPPORTUNITY");
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  // Conversations + contact roster (source/tags) + opportunities (pipeline
  // stage) + pipelines (stage id -> name), fetched in parallel. The opportunity
  // and pipeline fetches degrade to empty on failure so the inbox still loads
  // (everything then buckets under "New / Unsorted").
  const [all, contacts, opps, pipelinesData] = await Promise.all([
    fetchAllConversations(gctx),
    fetchAllContacts(gctx),
    fetchAllOpportunities(gctx).catch(() => []),
    ghlJson<PipelinesResponse>(
      gctx,
      `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
    ).catch(() => ({ pipelines: [] }) as PipelinesResponse),
  ]);

  const byContact = new Map(contacts.map((c) => [c.id, c]));

  const oppIndex = buildOpportunityIndex(opps);
  const positionIndex = buildPipelinePositions(opps);
  const stageById = new Map<string, { pipelineName: string; stageName: string }>();
  for (const p of pipelinesData.pipelines ?? []) {
    for (const st of p.stages ?? []) {
      stageById.set(st.id, { pipelineName: p.name, stageName: st.name });
    }
  }

  const items = all
    .filter((c) => Boolean(c.contactId))
    .map((c) => {
      const contact = byContact.get(c.contactId as string);
      const name = c.fullName || c.contactName || c.email || c.phone || "Unknown";
      const previewRaw = c.lastMessageBody ?? "";
      const preview = isSystemActivity(c.lastMessageType) ? "" : previewRaw;
      const atMs =
        typeof c.lastMessageDate === "number"
          ? c.lastMessageDate
          : c.lastMessageDate
            ? +new Date(c.lastMessageDate)
            : NaN;
      const lastType =
        typeof c.lastMessageType === "string" ? c.lastMessageType : "";
      const chosen = oppIndex.get(c.contactId as string);
      const stage = chosen ? stageById.get(chosen.pipelineStageId) : undefined;
      // Drop positions whose stage id is not in any pipeline we can read (a
      // deleted stage, or a pipelines fetch that degraded to empty) rather than
      // emitting a nameless entry the client cannot match on.
      const pipelines = (positionIndex.get(c.contactId as string) ?? [])
        .map((p) => {
          const st = stageById.get(p.pipelineStageId);
          return st
            ? {
                pipelineId: p.pipelineId,
                pipelineStageId: p.pipelineStageId,
                pipelineName: st.pipelineName,
                stageName: st.stageName,
                status: p.status,
              }
            : null;
        })
        .filter((p): p is ConversationPipeline => p !== null);
      return {
        id: c.id,
        contactId: c.contactId as string,
        name,
        preview,
        lastMessageType: lastType,
        lastMessageAt: Number.isFinite(atMs)
          ? new Date(atMs).toISOString()
          : new Date().toISOString(),
        unreadCount: c.unreadCount ?? 0,
        channel: normalizeChannel(lastType),
        origin: classifyOrigin(contact?.source, contact?.tags),
        source: contact?.source ?? "",
        firstTouchAt: contact?.dateAdded ?? "",
        pipelineId: chosen?.pipelineId,
        pipelineStageId: chosen?.pipelineStageId,
        pipelineName: stage?.pipelineName,
        stageName: stage?.stageName,
        pipelines,
      } satisfies ApiConversation;
    });

  return Response.json({ conversations: items, total: items.length });
};
