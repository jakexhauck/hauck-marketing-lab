// Closing out a completed job: turning a won Sales lead into a customer.
//
// This module decides WHAT should happen and returns it as data. It performs no
// writes, so every rule below (including the repeat-customer rule, which is the
// subtle one) is unit-tested without GHL or Supabase. The endpoint executes the
// plan; see functions/api/sales/close-outs/index.ts for the ordering and the
// failure behaviour.
//
// The two paths:
//
//   First-timer  The SAME Sales opportunity MOVES into the Customers pipeline at
//                the chosen stage, marked won. Not a copy: the lead's whole
//                history travels with them, and it leaves "Job Completed" so the
//                stage drains itself.
//
//   Repeat       The contact already has a Customers card. Moving the incoming
//                one in as well would give them two. So we move the EXISTING card
//                to the chosen stage and PARK the incoming Sales opportunity
//                (marked won, left where it is).
//
// That parked card is why the close-out alert cannot simply mean "cards in Job
// Completed": it stays there forever. The alert rule is instead
//
//     in Job Completed AND its id is absent from customer_jobs.source_opportunity_id
//
// which is correct for both paths, and is what functions/api/sales/close-outs/
// count.ts implements.

import type { PipelineLike } from "./customers";

export type CustomerType = "one-time" | "recurring";

export type NextServiceChoice =
  // They know the date: book it on the client's service calendar.
  | { mode: "book"; at?: string }
  // Recurring, date unknown. The Customers page shows amber until it is booked.
  | { mode: "unplanned" }
  // Recurring, nothing due. No amber, no nag.
  | { mode: "none" };

export interface CloseOutInput {
  sourceOpportunityId: string;
  contactId: string;
  type: CustomerType;
  description: string;
  valueCents: number;
  completedOn: string; // YYYY-MM-DD
  nextService: NextServiceChoice;
  pipeline: PipelineLike;
  // The contact's existing card in the Customers pipeline, if they are already a
  // customer. Null for a first-timer.
  existingCustomerOpp: { id: string; pipelineStageId: string } | null;
  today: Date;
}

export type GhlWrite =
  | {
      kind: "move";
      opportunityId: string;
      pipelineId: string;
      pipelineStageId: string;
      status: "won";
    }
  | { kind: "park"; opportunityId: string; status: "won" };

export interface JobWrite {
  ghlContactId: string;
  description: string;
  valueCents: number;
  completedOn: string;
  sourceOpportunityId: string;
}

export type PlanWrite =
  | { action: "clear" }
  | {
      action: "set";
      nextServiceAt: string | null;
      status: "booked" | "unplanned" | "none";
    };

export interface CloseOutPlan {
  ghlWrites: GhlWrite[];
  job: JobWrite;
  plan: PlanWrite;
  appointment: { at: string } | null;
}

export type CloseOutError =
  | "description_required"
  | "negative_value"
  | "invalid_date"
  | "future_date"
  | "next_service_date_required"
  | "next_service_in_past"
  | "stage_not_found";

export type CloseOutResult =
  | { ok: true; plan: CloseOutPlan }
  | { ok: false; error: CloseOutError };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Match the stage for the chosen type BY NAME, so a client rename or an emoji
// suffix cannot break the write. "recurring" is checked as a word; one-time is
// anything else the client called their first stage, matched on "one" so
// "One-Time", "One Time" and "One-Off Customer" all land.
function stageIdFor(pipeline: PipelineLike, type: CustomerType): string | null {
  const stages = pipeline.stages;
  if (type === "recurring") {
    return stages.find((s) => norm(s.name).includes("recurring"))?.id ?? null;
  }
  const oneTime = stages.find((s) => {
    const n = norm(s.name);
    return !n.includes("recurring") && (n.includes("one") || n.includes("1"));
  });
  return oneTime?.id ?? null;
}

// A bare YYYY-MM-DD compared against a bare YYYY-MM-DD. Comparing a parsed Date
// against `today` would drag the job date through a timezone and reject work
// completed today for anyone west of UTC.
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function planCloseOut(input: CloseOutInput): CloseOutResult {
  const description = input.description.trim();
  if (!description) return { ok: false, error: "description_required" };

  if (!Number.isFinite(input.valueCents) || input.valueCents < 0) {
    return { ok: false, error: "negative_value" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completedOn)) {
    return { ok: false, error: "invalid_date" };
  }
  const parsed = new Date(`${input.completedOn}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false, error: "invalid_date" };
  if (input.completedOn > isoDay(input.today)) return { ok: false, error: "future_date" };

  const stageId = stageIdFor(input.pipeline, input.type);
  if (!stageId) return { ok: false, error: "stage_not_found" };

  let plan: PlanWrite;
  let appointment: { at: string } | null = null;

  if (input.type === "one-time") {
    // A one-off is never "next due". Clearing matters when a recurring customer
    // is closed out as one-time: their old next-service date must not survive.
    plan = { action: "clear" };
  } else if (input.nextService.mode === "book") {
    const at = input.nextService.at;
    if (!at) return { ok: false, error: "next_service_date_required" };
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "invalid_date" };
    if (when.getTime() < input.today.getTime()) {
      return { ok: false, error: "next_service_in_past" };
    }
    plan = { action: "set", nextServiceAt: at, status: "booked" };
    appointment = { at };
  } else {
    plan = {
      action: "set",
      nextServiceAt: null,
      status: input.nextService.mode === "none" ? "none" : "unplanned",
    };
  }

  const ghlWrites: GhlWrite[] = input.existingCustomerOpp
    ? [
        // Repeat: move the card they already have...
        {
          kind: "move",
          opportunityId: input.existingCustomerOpp.id,
          pipelineId: input.pipeline.id,
          pipelineStageId: stageId,
          status: "won",
        },
        // ...and park the incoming one so it stops asking to be closed out.
        { kind: "park", opportunityId: input.sourceOpportunityId, status: "won" },
      ]
    : [
        {
          kind: "move",
          opportunityId: input.sourceOpportunityId,
          pipelineId: input.pipeline.id,
          pipelineStageId: stageId,
          status: "won",
        },
      ];

  return {
    ok: true,
    plan: {
      ghlWrites,
      job: {
        ghlContactId: input.contactId,
        description,
        valueCents: input.valueCents,
        completedOn: input.completedOn,
        sourceOpportunityId: input.sourceOpportunityId,
      },
      plan,
      appointment,
    },
  };
}
