// Shared model for the owner-side Handoffs / Sales-Leads surface going live.
// The frontend (src/routes/Handoffs.tsx, src/lib/api.ts) reads Willis's real
// Sales pipeline through /api/handoffs and writes outcomes through
// /api/handoffs/:id. Everything the read + write endpoints share (the wire
// shape, the stage <-> status translation, the Sales-pipeline resolver) lives
// here so the two routes and the unit tests read one source of truth.
//
// The one rule: pipelines and stages are resolved BY NAME per tenant (see
// resolveStageInPipeline in ../lib/writes.ts), never by hardcoded id. The IDs
// in the build plan are kept only as a last-resort fallback for Willis, applied
// solely when the live location IS Willis, so a cloned client can never write a
// Willis stage id into its own pipeline.

import { ghlJson, type GhlContext, type GhlOpportunity } from "../../lib/ghl";
import { resolveStageInPipeline } from "../lib/writes";

// The owner Handoff lifecycle states, 1:1 with the demo + src/lib/api.ts.
export type HandoffStatus =
  | "new"
  | "estimate_set"
  | "job_booked"
  | "won"
  | "lost"
  | "later";

export type HandoffLostReason =
  | "price"
  | "timing"
  | "competitor"
  | "ghosted"
  | "diy"
  | "other";

// The wire shape, matching ApiHandoff in src/lib/api.ts EXACTLY. The chat
// fields (lastMessage / firstOwnerReplyAt / unread) are inert here: the owner
// works the lead from their own phone now, so live has no group chat. They stay
// on the type only so the demo and live payloads are identical.
export interface ApiHandoff {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  setterName: string;
  status: HandoffStatus;
  value: number | null;
  lostReason: HandoffLostReason | null;
  handedAt: string;
  firstOwnerReplyAt: string | null;
  estimateAt: string | null;
  jobAt: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  address: string | null;
  service: string | null;
  closedAt: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

// Willis last-resort fallbacks (build plan section 1). Applied ONLY when the
// live location is Willis and name resolution failed, never for a cloned client.
export const WILLIS_LOCATION_ID = "OznT3yyuwK3dqVXDsCaD";
export const WILLIS_SALES_PIPELINE_ID = "7MJx8GtDCrni5AO54sGQ";
const WILLIS_STAGE_IDS: Record<HandoffStatus, string> = {
  new: "7a3284b5-442d-4f28-8c3d-c24ee354c67a", // Handed Off
  estimate_set: "89f9d347-80fd-41ae-95db-d4d514a77853", // Estimate Booked
  job_booked: "2183e4b6-d75b-412c-b41d-ceb527ea1bc6", // Job Booked
  won: "edce7a5f-bebb-433b-a61b-c3b964eddf53", // Won
  lost: "d8fc71b5-8dc1-4c9f-8670-4ac2bcd77422", // Lost
  later: "206d6d45-d541-43b2-b957-7255afd25ee4", // Follow Up
};

// The canonical GHL stage name each status writes into (resolved by name).
export const STATUS_STAGE_NAME: Record<HandoffStatus, string> = {
  new: "Handed Off",
  estimate_set: "Estimate Booked",
  job_booked: "Job Booked",
  won: "Won",
  lost: "Lost",
  later: "Follow Up",
};

// The GHL tag each outcome applies so the client's downstream automations
// (review request, nurture) still fire. Estimate / Job add no tag: booking the
// appointment is the trigger. Mirrors OUTCOME_TAG in src/lib/handoffModel.ts.
export const OUTCOME_TAG: Record<HandoffStatus, string | null> = {
  new: null,
  estimate_set: null,
  job_booked: null,
  won: "owner won",
  lost: "owner lost",
  later: "owner follow up",
};

// Normalize a GHL stage name for matching: lowercase, strip emoji/punctuation
// to spaces, collapse runs, trim. So "🤝 Handed Off" and "handed-off" both land.
export function normalizeStageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A live Sales-pipeline stage NAME to a Handoff status, tolerant to emoji and
// small renames. Returns null for stages that are not part of the handoff
// lifecycle (e.g. "Job Completed", an intake stage), so those opps are left off
// the owner's Leads board rather than mis-labelled. Order matters: the specific
// checks ("estimate", "job ... book") run before the bare-word fallbacks so
// "Job Completed" never matches "job_booked".
export function stageNameToStatus(name: string): HandoffStatus | null {
  const n = normalizeStageName(name);
  if (!n) return null;
  if (n === "handed off" || n.includes("hand off") || n.includes("handed")) return "new";
  if (n.includes("estimate")) return "estimate_set";
  if (n === "job booked" || (n.includes("job") && n.includes("book"))) return "job_booked";
  if (n.includes("follow")) return "later";
  if (n.includes("won")) return "won";
  if (n.includes("lost")) return "lost";
  return null;
}

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

export interface ResolvedSalesPipeline {
  pipelineId: string;
  // stageId -> status, for shaping opps on read.
  statusByStageId: Map<string, HandoffStatus>;
}

// Find the tenant's "Sales" pipeline by name (exact then contains), and build a
// stageId -> status map from its live stages. Falls back to the Willis pipeline
// id only when the live location IS Willis and no named match was found. Returns
// null when there is no Sales pipeline at all, so the caller degrades to empty.
export async function resolveSalesPipeline(
  gctx: GhlContext,
): Promise<ResolvedSalesPipeline | null> {
  const data = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const pipes = data.pipelines ?? [];
  const pipe =
    pipes.find((p) => normalizeStageName(p.name) === "sales") ??
    pipes.find((p) => normalizeStageName(p.name).includes("sales")) ??
    (gctx.locationId === WILLIS_LOCATION_ID
      ? pipes.find((p) => p.id === WILLIS_SALES_PIPELINE_ID)
      : undefined);
  if (!pipe) return null;

  const statusByStageId = new Map<string, HandoffStatus>();
  for (const s of pipe.stages ?? []) {
    const status = stageNameToStatus(s.name);
    if (status) statusByStageId.set(s.id, status);
  }
  return { pipelineId: pipe.id, statusByStageId };
}

// Resolve the target stage id for a status within a known pipeline, by name,
// with the Willis id as a last resort (Willis location only).
export async function resolveTargetStageId(
  gctx: GhlContext,
  pipelineId: string,
  status: HandoffStatus,
): Promise<string | null> {
  const byName = await resolveStageInPipeline(gctx, pipelineId, STATUS_STAGE_NAME[status]);
  if (byName) return byName;
  if (gctx.locationId === WILLIS_LOCATION_ID) return WILLIS_STAGE_IDS[status];
  return null;
}

// Shape one GHL opportunity into the owner Handoff wire shape. `status` is
// resolved from the stage map by the caller (it owns the pipeline context).
// address / service are enrichment the list fills in for booked leads; every
// other lead carries null, matching the demo's null-until-set discipline.
export function shapeHandoff(
  opp: GhlOpportunity,
  status: HandoffStatus,
  extra: { address?: string | null; service?: string | null } = {},
): ApiHandoff {
  const c = opp.contact ?? {};
  const name =
    c.name ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    opp.name ||
    "Unknown";
  const closed = status === "won" || status === "lost";
  return {
    id: opp.id,
    contactId: c.id ?? opp.contactId ?? "",
    name,
    phone: c.phone ?? "",
    // GHL opportunity search carries no "which setter" field; a generic label
    // until per-setter attribution is wired (build plan section 6).
    setterName: "Setter",
    status,
    value: typeof opp.monetaryValue === "number" ? opp.monetaryValue : null,
    lostReason: null,
    handedAt: opp.createdAt ?? new Date().toISOString(),
    firstOwnerReplyAt: null,
    estimateAt: status === "estimate_set" ? opp.lastStatusChangeAt ?? null : null,
    jobAt: status === "job_booked" ? opp.lastStatusChangeAt ?? null : null,
    followUpAt: null,
    followUpNote: null,
    address: extra.address ?? null,
    service: extra.service ?? null,
    closedAt: closed ? opp.lastStatusChangeAt ?? opp.updatedAt ?? null : null,
    lastMessage: null,
    lastMessageAt: null,
    unread: 0,
  };
}

// Active leads (still in play) first, newest by handoff time; closed (won/lost)
// sink below, also newest-first. Mirrors the demo handler's sorted().
export function sortHandoffs(list: ApiHandoff[]): ApiHandoff[] {
  const rank = (h: ApiHandoff) => (h.status === "won" || h.status === "lost" ? 1 : 0);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return new Date(b.handedAt).getTime() - new Date(a.handedAt).getTime();
  });
}

// The service + scope value written at an estimate booking, read back for the
// Job pre-fill. Stored in a per-client custom field when one exists; resolve its
// id by fieldKey (contains "service"). Cached inside customFieldKeyMap already.
import { customFieldKeyMap } from "../../lib/ghl";
export async function resolveServiceFieldId(gctx: GhlContext): Promise<string | null> {
  try {
    const map = await customFieldKeyMap(gctx);
    for (const [id, fieldKey] of map.entries()) {
      const key = fieldKey.toLowerCase().replace(/^contact\./, "");
      if (key.includes("service")) return id;
    }
  } catch {
    // No custom-field access is not fatal: service pre-fill simply stays empty.
  }
  return null;
}
