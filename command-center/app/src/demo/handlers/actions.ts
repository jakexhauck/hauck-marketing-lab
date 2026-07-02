import type { DemoRoute } from "./index";
import { DEMO_JOBS } from "../../lib/jobsPipeline";
import { DEMO_LEADS } from "../../lib/leadsHub";

// Demo cases for the wired write actions on the Jobs + Leads surfaces. These
// endpoints are NOT matched inline in handler.ts, so they fall through to here.
// Each mutates its feature's own demo array in place, so the next read of
// /api/sales/jobs or /api/sales/leads (same array reference) reflects the write
// and the demo behaves like a live account without touching a real client.
//
// Only reads happen against the shared arrays elsewhere, so mutating an element
// here is safe. Kept in this feature file per the build's isolation contract;
// handler.ts and data.ts are never edited.

// POST /api/sales/jobs/:id/complete -> flip a booked demo job to completed.
const completeJob: DemoRoute = {
  match: (_clean, seg) =>
    seg[0] === "api" &&
    seg[1] === "sales" &&
    seg[2] === "jobs" &&
    seg[4] === "complete",
  respond: ({ seg, method }) => {
    if (method !== "POST") return { ok: false };
    const job = DEMO_JOBS.find((j) => j.id === seg[3]);
    if (job) job.status = "completed";
    return { ok: true, status: "completed" };
  },
};

// POST /api/sales/leads/:id/stage -> apply the off-ramp to a demo lead. A lost /
// abandoned status parks the lead (our "cold" status); any other status is a
// no-op that still succeeds.
const moveLeadStage: DemoRoute = {
  match: (_clean, seg) =>
    seg[0] === "api" &&
    seg[1] === "sales" &&
    seg[2] === "leads" &&
    seg[4] === "stage",
  respond: ({ seg, method, body }) => {
    if (method !== "POST") return { ok: false };
    const lead = DEMO_LEADS.find((l) => l.id === seg[3]);
    if (lead && (body.status === "lost" || body.status === "abandoned")) {
      lead.status = "cold";
    }
    return { ok: true };
  },
};

export const routes: DemoRoute[] = [completeJob, moveLeadStage];
