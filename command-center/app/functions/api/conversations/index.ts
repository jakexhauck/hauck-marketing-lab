import type { Env, ApiData } from "../../lib/env";
import {
  fetchAllConversations,
  fetchAllContacts,
  fetchAllOpportunities,
  ghlJson,
  type GhlContext,
  type GhlOpportunity,
} from "../../lib/ghl";
import {
  buildOpportunityIndex,
  buildPipelinePositions,
} from "../../lib/opportunityIndex";
import { classifyOrigin, normalizeChannel } from "../../lib/origin";
import type { OriginKey, ChannelKey } from "../../lib/origin";
import { makeInternalConversationFilter } from "../../lib/internalRecipients";
import {
  resolveClientInboxScope,
  buildVisibleContactIds,
  tagVisibleContactIds,
  widenWithTag,
  type ClientInboxScope,
} from "../../lib/handoffScope";

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
  // Does this conversation belong in the client's INBOX, as opposed to merely
  // being in the payload? True for a lead in the hand-off pipeline. False for a
  // review request, which rides along only because Reviews > Chats reads this
  // same feed. Always true when the gate is off, so an ungated client's Inbox
  // is exactly what it was before.
  inbox: boolean;
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

// The opportunities the visibility gate should be built from, or null to leave
// the gate off and return the feed unchanged.
//
// The normal path reuses the location-wide list the endpoint already fetched, so
// gating costs no extra GHL calls. fetchAllOpportunities is page-capped though,
// and a gate built from a truncated list would hide real handed-off threads
// rather than fail loudly, so a capped fetch re-reads just the one or two
// pipelines that matter: far fewer rows, and only in that case. If even that
// fails, the gate goes off rather than hiding anything.
async function opportunitiesForGate(
  gctx: GhlContext,
  scope: ClientInboxScope | null,
  opps: GhlOpportunity[],
  truncated: boolean,
): Promise<GhlOpportunity[] | null> {
  if (!scope) return null;
  if (!truncated) return opps;

  const pipelineIds = [scope.handoffPipelineId, scope.reviewsPipelineId].filter(
    (id): id is string => Boolean(id),
  );
  try {
    const pages = await Promise.all(
      pipelineIds.map((pipelineId) =>
        fetchAllOpportunities(gctx, { pipelineId, maxPages: 30 }),
      ),
    );
    return pages.flat();
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx = { token: t.ghl_token, locationId: t.ghl_location_id };

  // Conversations + contact roster (source/tags) + opportunities (pipeline
  // stage) + pipelines (stage id -> name), fetched in parallel. The opportunity
  // and pipeline fetches degrade to empty on failure so the inbox still loads
  // (everything then buckets under "New / Unsorted").
  // Tracked separately from the empty array, because "the opportunities fetch
  // failed" and "this client has no opportunities" look identical downstream and
  // must not: the first has to leave the Inbox gate off, the second is a real
  // empty result. See the visibility gate below.
  let oppsFailed = false;
  const oppsTruncated = { value: false };
  const [all, contacts, opps, pipelinesData] = await Promise.all([
    fetchAllConversations(gctx),
    fetchAllContacts(gctx),
    fetchAllOpportunities(gctx, { truncated: oppsTruncated }).catch(() => {
      oppsFailed = true;
      return [];
    }),
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

  // Internal notification sinks are hidden from the client entirely.
  const isInternalConversation = makeInternalConversationFilter(
    contacts,
    t.internal_recipients,
  );

  // The client sees the chats for estimates we book and leads we hand off, and
  // nothing else: a conversation reaches the Inbox only if its contact holds an
  // opportunity in the hand-off pipeline, or in the Google Reviews pipeline that
  // Reviews > Chats reads through this same feed. The setter's own work -- raw
  // opt-ins, the no-answer chase, Trash -- never leaves the Worker.
  //
  // A failed opportunities fetch leaves the gate off deliberately: gating on a
  // list we could not read would blank an Inbox that is actually fine.
  const scope = oppsFailed
    ? null
    : resolveClientInboxScope(
        pipelinesData.pipelines ?? [],
        t.client_inbox_pipeline_id,
      );
  const gateOpps = await opportunitiesForGate(
    gctx,
    scope,
    opps,
    oppsTruncated.value,
  );
  // Two sets, because the feed and the Inbox are not the same list. `visible`
  // is what may leave the Worker at all (hand-off + Google Reviews). `inbox` is
  // the narrower hand-off-only set that decides the `inbox` flag below, so a
  // review request never lands in the Inbox just because Reviews > Chats needs
  // it in the payload. Both null => gate off, and every conversation is both.
  //
  // Then widened by tag (0103): a client who works their own leads hands
  // nothing off, so the pipeline rule alone would leave their Inbox empty while
  // their leads are texting them. Widens both sets, because a lead they are
  // meant to be replying to belongs in the Inbox, not merely in the payload.
  const taggedContacts = tagVisibleContactIds(
    contacts as { id?: string | null; tags?: string[] | null }[],
    t.inbox_visible_tag,
  );
  const visibleContacts = widenWithTag(
    scope && gateOpps ? buildVisibleContactIds(scope, gateOpps) : null,
    taggedContacts,
  );
  const inboxContacts = widenWithTag(
    scope && gateOpps
      ? buildVisibleContactIds({ ...scope, reviewsPipelineId: null }, gateOpps)
      : null,
    taggedContacts,
  );

  const items = all
    .filter((c) => Boolean(c.contactId))
    .filter((c) => !isInternalConversation(c))
    .filter(
      (c) => !visibleContacts || visibleContacts.has(c.contactId as string),
    )
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
        inbox: !inboxContacts || inboxContacts.has(c.contactId as string),
      } satisfies ApiConversation;
    });

  return Response.json({ conversations: items, total: items.length });
};
