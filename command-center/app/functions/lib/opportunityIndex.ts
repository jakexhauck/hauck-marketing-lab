import type { GhlOpportunity } from "./ghl";

// A contact can have zero or many opportunities across pipelines. For the inbox
// we need exactly one stage per contact: prefer an open opportunity, and within
// the same open/closed class prefer the most recently updated. Falls back to the
// most recent of any status when none are open.
export interface ChosenOpp {
  pipelineId: string;
  pipelineStageId: string;
  status: string;
}

function recency(o: GhlOpportunity): number {
  const raw = o.updatedAt ?? o.lastStatusChangeAt ?? o.createdAt ?? "";
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Every opportunity a contact holds, not just the chosen one. A contact is
// routinely in two pipelines at once: a past customer sits in Sales "Job
// Completed" AND Google Reviews "Asked For Review" while the review request is
// out. `buildOpportunityIndex` keeps only one of those, so a page that needs a
// SPECIFIC pipeline (the Reviews inbox needs the Google Reviews position, not
// whichever record GHL touched last) has to read this instead.
export function buildPipelinePositions(
  opps: GhlOpportunity[],
): Map<string, ChosenOpp[]> {
  const out = new Map<string, ChosenOpp[]>();
  for (const o of opps) {
    if (!o.contactId) continue;
    const list = out.get(o.contactId) ?? [];
    list.push({
      pipelineId: o.pipelineId ?? "",
      pipelineStageId: o.pipelineStageId ?? "",
      status: o.status ?? "",
    });
    out.set(o.contactId, list);
  }
  return out;
}

export function buildOpportunityIndex(opps: GhlOpportunity[]): Map<string, ChosenOpp> {
  const best = new Map<string, GhlOpportunity>();
  for (const o of opps) {
    if (!o.contactId) continue;
    const cur = best.get(o.contactId);
    if (!cur) {
      best.set(o.contactId, o);
      continue;
    }
    const curOpen = cur.status === "open";
    const nextOpen = o.status === "open";
    if (nextOpen !== curOpen) {
      if (nextOpen) best.set(o.contactId, o);
      continue;
    }
    if (recency(o) > recency(cur)) best.set(o.contactId, o);
  }
  const out = new Map<string, ChosenOpp>();
  for (const [cid, o] of best) {
    out.set(cid, {
      pipelineId: o.pipelineId ?? "",
      pipelineStageId: o.pipelineStageId ?? "",
      status: o.status ?? "",
    });
  }
  return out;
}
