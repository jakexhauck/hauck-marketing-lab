import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { ghlJson, fetchAllOpportunities, type GhlContext } from "../../lib/ghl";

// The tag that starts the review ask. It must match the "Ongoing Review
// Campaign" workflow's trigger condition in GHL exactly (lower-case). Adding it
// to a contact is what makes the campaign fire; the page is the only thing in
// the system that adds it.
const REVIEW_TAG = "request review";

// How the completed-job pipeline + stage are found per tenant. IDs differ per
// client, so resolve by name, never hardcode. Exact match first, then a looser
// contains, so small renames ("Sales", "Sales Pipeline 2025") still resolve.
const SALES_PIPELINE = "sales pipeline";
const JOB_COMPLETED_STAGE = "job completed";

// Cap on the per-contact tag lookups used to compute "already started". Keeps a
// large completed-jobs history from fanning out into hundreds of contact reads.
// Surfaced to the client as truncatedAt so the UI can say "most recent N".
const STARTED_LOOKUP_CAP = 50;

interface PipelinesResponse {
  pipelines: {
    id: string;
    name: string;
    stages: { id: string; name: string }[];
  }[];
}

interface GhlContactResponse {
  contact?: { tags?: string[] };
}

export interface ApiReviewContact {
  contactId: string;
  name: string;
  phone: string;
  email: string;
  completedAt: string;
  started: boolean;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Find the Sales pipeline and its Job Completed stage by name. Returns null if
// either is absent so the caller can degrade to an empty list with a note.
function resolveStage(
  pipes: PipelinesResponse["pipelines"],
): { pipelineId: string; stageId: string } | null {
  const pipe =
    pipes.find((p) => norm(p.name) === SALES_PIPELINE) ??
    pipes.find((p) => norm(p.name).includes("sales"));
  if (!pipe) return null;
  const stage =
    pipe.stages.find((s) => norm(s.name) === JOB_COMPLETED_STAGE) ??
    pipe.stages.find((s) => norm(s.name).includes("job completed"));
  if (!stage) return null;
  return { pipelineId: pipe.id, stageId: stage.id };
}

async function startedSet(
  gctx: GhlContext,
  contactIds: string[],
): Promise<Set<string>> {
  const started = new Set<string>();
  await Promise.all(
    contactIds.map(async (id) => {
      try {
        const data = await ghlJson<GhlContactResponse>(
          gctx,
          `/contacts/${encodeURIComponent(id)}`,
        );
        const tags = (data.contact?.tags ?? []).map(norm);
        if (tags.includes(REVIEW_TAG)) started.add(id);
      } catch {
        // A single failed contact read should not fail the whole list; treat as
        // not-started (the button stays available, re-adding the tag is a no-op).
      }
    }),
  );
  return started;
}

// GET /api/reviews: contacts whose Sales-pipeline opportunity is in Job
// Completed, newest first, each flagged with whether the review campaign has
// already started for them.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(t.ghl_location_id)}`,
  );
  const resolved = resolveStage(pipeData.pipelines ?? []);
  if (!resolved) {
    return Response.json({ contacts: [], configError: "stage_not_found" });
  }

  const opps = await fetchAllOpportunities(gctx, {
    pipelineId: resolved.pipelineId,
  });

  // Keep only Job Completed, newest first by when they entered the stage.
  const completed = opps
    .filter((o) => o.pipelineStageId === resolved.stageId && o.contactId)
    .map((o) => {
      const c = o.contact ?? {};
      const name =
        c.name ||
        [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
        o.name ||
        "Unknown";
      return {
        contactId: o.contactId as string,
        name,
        phone: c.phone ?? "",
        email: c.email ?? "",
        completedAt: o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? "",
      };
    });

  // Dedupe by contact (a contact should only sit in the stage once; keep the
  // most recent if not).
  const byContact = new Map<string, (typeof completed)[number]>();
  for (const row of completed) {
    const prev = byContact.get(row.contactId);
    if (!prev || row.completedAt > prev.completedAt) {
      byContact.set(row.contactId, row);
    }
  }
  const rows = [...byContact.values()].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );

  const lookupIds = rows.slice(0, STARTED_LOOKUP_CAP).map((r) => r.contactId);
  const started = await startedSet(gctx, lookupIds);

  const contacts: ApiReviewContact[] = rows.map((r) => ({
    ...r,
    started: started.has(r.contactId),
  }));

  return Response.json({
    contacts,
    truncatedAt: rows.length > STARTED_LOOKUP_CAP ? STARTED_LOOKUP_CAP : undefined,
  });
};

interface StartBody {
  contactId?: string;
}

// POST /api/reviews { contactId }: add the review tag to the contact in GHL,
// which enrolls them in the Ongoing Review Campaign. Idempotent: re-adding an
// existing tag does not re-fire the workflow.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const input = await readJsonBody<StartBody>(ctx.request);
  if (!input) return Response.json({ error: "invalid_json" }, { status: 400 });
  const contactId = typeof input.contactId === "string" ? input.contactId.trim() : "";
  if (!contactId) {
    return Response.json({ error: "missing_contact_id" }, { status: 400 });
  }

  await ghlJson(
    { token: t.ghl_token, locationId: t.ghl_location_id },
    `/contacts/${encodeURIComponent(contactId)}/tags`,
    { method: "POST", body: JSON.stringify({ tags: [REVIEW_TAG] }) },
  );

  return Response.json({ ok: true });
};
