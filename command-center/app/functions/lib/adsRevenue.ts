import { dateStringInZone } from "./tz";
import {
  ghlJson,
  fetchAllOpportunities,
  type GhlContext,
  type GhlOpportunity,
} from "./ghl";

// The GHL join behind the Paid Ads Overview's "New customers", "Revenue from
// ads" and "Your return" (ROAS) tiles. Meta can tell us spend and leads, but for
// a lead-gen business only GHL knows which of those leads became a paid job.
//
// Jake's real GHL flow: every ad lead is tagged "facebook ads"; the lead runs
// through the Paid Ad's Pipeline, then the Sales Pipeline, and when the job is
// done it lands in Job Completed with the job's dollar value on the opportunity.
// So an ad-won customer = a Job Completed opportunity whose contact carries the
// "facebook ads" tag, and its revenue = that opportunity's monetaryValue.
//
// Windowed to the current month so it lines up with Meta's this-month spend and
// the ROAS reads honestly against it.

// The tag GHL adds to every ad lead (matched case-insensitively, and by a loose
// contains so "Facebook Ads" / "facebook ad" all resolve).
const AD_TAG = "facebook ad";

// How the completed-job pipeline + stage are found per tenant. IDs differ per
// client, so resolve by name, never hardcode. Exact match first, then a looser
// contains, mirroring functions/api/reviews.
const SALES_PIPELINE = "sales pipeline";
const JOB_COMPLETED_STAGE = "job completed";

// Cap on the per-contact tag lookups. Only completed-job contacts are ever
// looked up (already a small set), but bound the fan-out so an unusually long
// history can't spray hundreds of contact reads. Newest completions win the
// budget; anything beyond is reported as truncated.
const TAG_LOOKUP_CAP = 100;

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

export interface AdRevenue {
  customers: number;
  revenue: number;
  // True when the completed-job history exceeded TAG_LOOKUP_CAP, so revenue is a
  // floor (newest N counted). The caller surfaces this to the connections doc,
  // not the client UI.
  truncated: boolean;
}

const ZERO: AdRevenue = { customers: 0, revenue: 0, truncated: false };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// The completion instant of an opportunity: when it last changed stage (i.e.
// entered Job Completed), falling back to updated/created.
function completedAt(o: GhlOpportunity): string {
  return o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? "";
}

// Find the Sales pipeline and its Job Completed stage by name. Null if either is
// absent so the caller can degrade to honest zeros.
export function resolveCompletedStage(
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

// Pure core: the Job Completed opportunities that closed in `monthKey`
// (YYYY-MM, tenant-zone), newest first. Testable without any I/O.
export function completedInMonth(
  opps: GhlOpportunity[],
  stageId: string,
  monthKey: string,
  zone: string,
): GhlOpportunity[] {
  return opps
    .filter((o) => {
      if (o.pipelineStageId !== stageId) return false;
      const id = o.contactId ?? o.contact?.id;
      if (!id) return false;
      const ts = completedAt(o);
      if (!ts) return false;
      const ms = +new Date(ts);
      if (!Number.isFinite(ms)) return false;
      return dateStringInZone(zone, ms).slice(0, 7) === monthKey;
    })
    .sort((a, b) => +new Date(completedAt(b)) - +new Date(completedAt(a)));
}

// Pure core: tally customers + revenue from the ad-tagged completed opps.
export function tallyRevenue(adWon: GhlOpportunity[]): { customers: number; revenue: number } {
  let revenue = 0;
  for (const o of adWon) {
    revenue += typeof o.monetaryValue === "number" ? o.monetaryValue : 0;
  }
  return { customers: adWon.length, revenue: Math.round(revenue * 100) / 100 };
}

// Does a contact's tag list mark it as an ad lead?
export function hasAdTag(tags: string[] | undefined): boolean {
  return (tags ?? []).some((t) => norm(t).includes(AD_TAG));
}

// The full join: this month's ad-won customers and their revenue for one tenant.
// Never throws for a "no data" situation (missing pipeline/stage => honest
// zeros); a hard GHL/network failure propagates to the caller, which degrades to
// zeros so Meta numbers still render.
export async function adRevenueThisMonth(
  gctx: GhlContext,
  zone: string,
  nowMs: number = Date.now(),
): Promise<AdRevenue> {
  const pipeData = await ghlJson<PipelinesResponse>(
    gctx,
    `/opportunities/pipelines?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const resolved = resolveCompletedStage(pipeData.pipelines ?? []);
  if (!resolved) return ZERO;

  const monthKey = dateStringInZone(zone, nowMs).slice(0, 7);
  const opps = await fetchAllOpportunities(gctx, { pipelineId: resolved.pipelineId });
  const completed = completedInMonth(opps, resolved.stageId, monthKey, zone);
  if (completed.length === 0) return ZERO;

  const truncated = completed.length > TAG_LOOKUP_CAP;
  const budget = truncated ? completed.slice(0, TAG_LOOKUP_CAP) : completed;

  // Keep only the completions whose contact carries the ad tag. One read per
  // completed contact; a single failed read drops that opp (never counts a job
  // we can't attribute), like functions/api/reviews.
  const adWon = (
    await Promise.all(
      budget.map(async (o) => {
        const id = (o.contactId ?? o.contact?.id) as string;
        try {
          const data = await ghlJson<GhlContactResponse>(
            gctx,
            `/contacts/${encodeURIComponent(id)}`,
          );
          return hasAdTag(data.contact?.tags) ? o : null;
        } catch {
          return null;
        }
      }),
    )
  ).filter((o): o is GhlOpportunity => o !== null);

  return { ...tallyRevenue(adWon), truncated };
}
