import { describe, it, expect } from "vitest";
import { planCloseOut, type CloseOutInput } from "./closeOut";

const PIPE = {
  id: "pipe_cust",
  name: "Customers",
  stages: [
    { id: "st_one", name: "One-Time Customer 1️⃣" },
    { id: "st_rec", name: "Recurring Customer 🔁" },
  ],
};

const TODAY = new Date("2026-07-16T12:00:00.000Z");

function input(over: Partial<CloseOutInput> = {}): CloseOutInput {
  return {
    sourceOpportunityId: "opp_sales_1",
    contactId: "c_sarah",
    type: "one-time",
    description: "Full house wash",
    valueCents: 420_000,
    completedOn: "2026-07-02",
    nextService: { mode: "none" },
    pipeline: PIPE,
    existingCustomerOpp: null,
    today: TODAY,
    ...over,
  };
}

function ok(result: ReturnType<typeof planCloseOut>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.plan;
}

describe("planCloseOut — first-time customer", () => {
  it("moves the same Sales opportunity into Customers and marks it won", () => {
    // The whole point of the design: one opportunity, moved. Not a copy, so the
    // lead's history travels with them and Job Completed drains itself.
    const plan = ok(planCloseOut(input()));
    expect(plan.ghlWrites).toEqual([
      {
        kind: "move",
        opportunityId: "opp_sales_1",
        pipelineId: "pipe_cust",
        pipelineStageId: "st_one",
        status: "won",
      },
    ]);
  });

  it("routes to the recurring stage when they picked recurring", () => {
    const plan = ok(planCloseOut(input({ type: "recurring", nextService: { mode: "unplanned" } })));
    expect(plan.ghlWrites[0]).toMatchObject({ pipelineStageId: "st_rec" });
  });

  it("records the job against the contact, carrying the ledger id", () => {
    const plan = ok(planCloseOut(input()));
    expect(plan.job).toEqual({
      ghlContactId: "c_sarah",
      description: "Full house wash",
      valueCents: 420_000,
      completedOn: "2026-07-02",
      sourceOpportunityId: "opp_sales_1",
    });
  });
});

describe("planCloseOut — repeat customer", () => {
  const existing = { id: "opp_cust_kim", pipelineStageId: "st_one" };

  it("moves the customer's EXISTING card and parks the incoming one", () => {
    // Moving the incoming opportunity in as well would leave Kim with two cards
    // in Customers. One card per contact, always.
    const plan = ok(
      planCloseOut(
        input({
          contactId: "c_kim",
          type: "recurring",
          nextService: { mode: "unplanned" },
          existingCustomerOpp: existing,
        }),
      ),
    );
    expect(plan.ghlWrites).toEqual([
      {
        kind: "move",
        opportunityId: "opp_cust_kim",
        pipelineId: "pipe_cust",
        pipelineStageId: "st_rec",
        status: "won",
      },
      { kind: "park", opportunityId: "opp_sales_1", status: "won" },
    ]);
  });

  it("still logs the job, so the repeat work counts toward their revenue", () => {
    const plan = ok(
      planCloseOut(input({ contactId: "c_kim", existingCustomerOpp: existing })),
    );
    expect(plan.job.ghlContactId).toBe("c_kim");
    expect(plan.job.sourceOpportunityId).toBe("opp_sales_1");
  });

  it("parks the incoming card even when the type has not changed", () => {
    const plan = ok(
      planCloseOut(input({ contactId: "c_kim", type: "one-time", existingCustomerOpp: existing })),
    );
    // The parked card is why the close-out alert must key off the job ledger and
    // not off the Job Completed stage: this one never leaves it.
    expect(plan.ghlWrites).toContainEqual({
      kind: "park",
      opportunityId: "opp_sales_1",
      status: "won",
    });
  });

  it("treats a returning one-off as exactly that, never auto-promoting", () => {
    const plan = ok(
      planCloseOut(input({ contactId: "c_kim", type: "one-time", existingCustomerOpp: existing })),
    );
    expect(plan.ghlWrites[0]).toMatchObject({ pipelineStageId: "st_one" });
  });
});

describe("planCloseOut — next service", () => {
  it("books the appointment and marks the plan booked", () => {
    const plan = ok(
      planCloseOut(
        input({
          type: "recurring",
          nextService: { mode: "book", at: "2026-10-02T13:00:00.000Z" },
        }),
      ),
    );
    expect(plan.appointment).toEqual({ at: "2026-10-02T13:00:00.000Z" });
    expect(plan.plan).toEqual({
      action: "set",
      nextServiceAt: "2026-10-02T13:00:00.000Z",
      status: "booked",
    });
  });

  it("chases them when they do not know the date yet", () => {
    const plan = ok(
      planCloseOut(input({ type: "recurring", nextService: { mode: "unplanned" } })),
    );
    expect(plan.appointment).toBeNull();
    expect(plan.plan).toEqual({ action: "set", nextServiceAt: null, status: "unplanned" });
  });

  it("stays silent when recurring but nothing is due", () => {
    const plan = ok(planCloseOut(input({ type: "recurring", nextService: { mode: "none" } })));
    expect(plan.plan).toEqual({ action: "set", nextServiceAt: null, status: "none" });
  });

  it("clears any plan when they are one-time: a one-off is never next due", () => {
    const plan = ok(planCloseOut(input({ type: "one-time" })));
    expect(plan.plan).toEqual({ action: "clear" });
    expect(plan.appointment).toBeNull();
  });

  it("rejects booking with no date, rather than silently not booking", () => {
    const r = planCloseOut(input({ type: "recurring", nextService: { mode: "book" } }));
    expect(r).toMatchObject({ ok: false, error: "next_service_date_required" });
  });

  it("rejects a next service date in the past", () => {
    const r = planCloseOut(
      input({ type: "recurring", nextService: { mode: "book", at: "2026-07-01T13:00:00.000Z" } }),
    );
    expect(r).toMatchObject({ ok: false, error: "next_service_in_past" });
  });
});

describe("planCloseOut — rejections", () => {
  it("requires a description: an unnamed job is not a record of anything", () => {
    expect(planCloseOut(input({ description: "   " }))).toMatchObject({
      ok: false,
      error: "description_required",
    });
  });

  it("allows a zero-value job, because a warranty callback is real work", () => {
    expect(planCloseOut(input({ valueCents: 0 })).ok).toBe(true);
  });

  it("rejects a negative value", () => {
    expect(planCloseOut(input({ valueCents: -1 }))).toMatchObject({
      ok: false,
      error: "negative_value",
    });
  });

  it("rejects a completion date in the future", () => {
    expect(planCloseOut(input({ completedOn: "2026-07-17" }))).toMatchObject({
      ok: false,
      error: "future_date",
    });
  });

  it("accepts a job completed today", () => {
    expect(planCloseOut(input({ completedOn: "2026-07-16" })).ok).toBe(true);
  });

  it("accepts an old job", () => {
    expect(planCloseOut(input({ completedOn: "2024-01-05" })).ok).toBe(true);
  });

  it("rejects an unparseable date", () => {
    expect(planCloseOut(input({ completedOn: "not-a-date" }))).toMatchObject({
      ok: false,
      error: "invalid_date",
    });
  });

  it("fails honestly when the pipeline has no stage matching the chosen type", () => {
    const broken = { ...PIPE, stages: [{ id: "st_x", name: "Something Else" }] };
    expect(planCloseOut(input({ pipeline: broken }))).toMatchObject({
      ok: false,
      error: "stage_not_found",
    });
  });

  it("resolves stages by name, surviving a rename and the emoji", () => {
    const renamed = {
      ...PIPE,
      stages: [
        { id: "st_a", name: "ONE-TIME 💰" },
        { id: "st_b", name: "recurring clients 🔁" },
      ],
    };
    const plan = ok(
      planCloseOut(input({ type: "recurring", pipeline: renamed, nextService: { mode: "none" } })),
    );
    expect(plan.ghlWrites[0]).toMatchObject({ pipelineStageId: "st_b" });
  });
});
