import { describe, it, expect } from "vitest";
import {
  resolveCustomersPipeline,
  isRecurringStage,
  centsFromMoney,
  moneyFromCents,
  serviceStateFor,
  buildCustomers,
  type CustomerJobRow,
  type ServicePlanRow,
} from "./customers";
import type { GhlOpportunity } from "./ghl";

// Willis's live shape (pulled 2026-07-16): stage names carry emoji suffixes, so
// nothing here may match on equality.
const STAGES = [
  { id: "st_one", name: "One-Time Customer 1️⃣" },
  { id: "st_rec", name: "Recurring Customer 🔁" },
];

const NOW = new Date("2026-07-16T12:00:00.000Z");

function opp(over: Partial<GhlOpportunity> & { id: string }): GhlOpportunity {
  return {
    pipelineId: "pipe_cust",
    pipelineStageId: "st_one",
    status: "won",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

function job(over: Partial<CustomerJobRow> & { ghlContactId: string }): CustomerJobRow {
  return {
    id: "job_" + Math.random().toString(36).slice(2),
    description: "Window wash",
    valueCents: 100_00,
    completedOn: "2026-06-01",
    sourceOpportunityId: null,
    ...over,
  };
}

describe("resolveCustomersPipeline", () => {
  const pipes = [
    { id: "p_sales", name: "Sales", stages: [] },
    { id: "p_cust", name: "Customers", stages: STAGES },
    { id: "p_trash", name: "Trash", stages: [] },
  ];

  it("matches the pipeline by exact name", () => {
    expect(resolveCustomersPipeline(pipes)?.id).toBe("p_cust");
  });

  it("survives a rename that still contains the word", () => {
    const renamed = [{ id: "p_x", name: "Our Customers 🏆", stages: STAGES }];
    expect(resolveCustomersPipeline(renamed)?.id).toBe("p_x");
  });

  it("returns null when the tenant has no Customers pipeline", () => {
    expect(resolveCustomersPipeline([{ id: "p_sales", name: "Sales", stages: [] }])).toBeNull();
  });

  it("prefers an exact match over a looser contains match", () => {
    const both = [
      { id: "p_loose", name: "Past Customers Archive", stages: [] },
      { id: "p_exact", name: "Customers", stages: [] },
    ];
    expect(resolveCustomersPipeline(both)?.id).toBe("p_exact");
  });
});

describe("isRecurringStage", () => {
  it("matches the live emoji-suffixed stage name", () => {
    expect(isRecurringStage("Recurring Customer 🔁")).toBe(true);
  });

  it("does not match the one-time stage", () => {
    expect(isRecurringStage("One-Time Customer 1️⃣")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isRecurringStage("RECURRING")).toBe(true);
  });
});

describe("money conversion", () => {
  it("converts GHL float dollars to integer cents", () => {
    expect(centsFromMoney(4200)).toBe(420_000);
    expect(centsFromMoney(19.99)).toBe(1999);
  });

  it("rounds rather than truncating, so a float never loses a cent", () => {
    expect(centsFromMoney(0.1 + 0.2)).toBe(30);
    expect(centsFromMoney(1.005)).toBe(101);
  });

  it("treats a missing or non-numeric value as zero", () => {
    expect(centsFromMoney(null)).toBe(0);
    expect(centsFromMoney(undefined)).toBe(0);
    expect(centsFromMoney(Number.NaN)).toBe(0);
  });

  it("round-trips back to dollars", () => {
    expect(moneyFromCents(420_000)).toBe(4200);
    expect(moneyFromCents(1999)).toBe(19.99);
  });
});

describe("serviceStateFor", () => {
  it("is null when the customer has no plan at all", () => {
    expect(serviceStateFor(null, NOW)).toBeNull();
  });

  it("is booked when the date is still ahead", () => {
    const plan: ServicePlanRow = {
      ghlContactId: "c1",
      nextServiceAt: "2026-10-02T13:00:00.000Z",
      status: "booked",
      ghlAppointmentId: "appt_1",
    };
    expect(serviceStateFor(plan, NOW)).toBe("booked");
  });

  it("is overdue once a booked date has passed", () => {
    const plan: ServicePlanRow = {
      ghlContactId: "c1",
      nextServiceAt: "2026-07-12T13:00:00.000Z",
      status: "booked",
      ghlAppointmentId: "appt_1",
    };
    expect(serviceStateFor(plan, NOW)).toBe("overdue");
  });

  it("is unplanned when they did not know the date yet", () => {
    const plan: ServicePlanRow = {
      ghlContactId: "c1",
      nextServiceAt: null,
      status: "unplanned",
      ghlAppointmentId: null,
    };
    expect(serviceStateFor(plan, NOW)).toBe("unplanned");
  });

  it("is none when recurring but nothing is due, so the page never nags", () => {
    const plan: ServicePlanRow = {
      ghlContactId: "c1",
      nextServiceAt: null,
      status: "none",
      ghlAppointmentId: null,
    };
    expect(serviceStateFor(plan, NOW)).toBe("none");
  });

  it("treats a booked date whose appointment never landed as unplanned", () => {
    // The calendar write failed after the job saved: we kept the date but have
    // no appointment backing it, so it must chase rather than claim a booking.
    const plan: ServicePlanRow = {
      ghlContactId: "c1",
      nextServiceAt: "2026-10-02T13:00:00.000Z",
      status: "booked",
      ghlAppointmentId: null,
    };
    expect(serviceStateFor(plan, NOW)).toBe("unplanned");
  });
});

describe("buildCustomers", () => {
  it("returns a column per live stage, recurring first, whatever order GHL gave them", () => {
    // Live Willis keeps One-Time at position 0; the page leads with Recurring.
    const { columns } = buildCustomers({ opps: [], stages: STAGES, jobs: [], plans: [], now: NOW });
    expect(columns.map((c) => c.name)).toEqual([STAGES[1].name, STAGES[0].name]);
    expect(columns.map((c) => c.recurring)).toEqual([true, false]);
  });

  it("keeps the client's own stage order among the non-recurring columns", () => {
    const stages = [...STAGES, { id: "st_vip", name: "VIP Customer ⭐" }];
    const { columns } = buildCustomers({ opps: [], stages, jobs: [], plans: [], now: NOW });
    expect(columns.map((c) => c.id)).toEqual(["st_rec", "st_one", "st_vip"]);
  });

  it("groups jobs onto their customer and totals them", () => {
    const opps = [opp({ id: "o1", contactId: "c1", pipelineStageId: "st_rec" })];
    const jobs = [
      job({ ghlContactId: "c1", valueCents: 120_000, completedOn: "2026-07-02" }),
      job({ ghlContactId: "c1", valueCents: 390_000, completedOn: "2026-04-14" }),
      job({ ghlContactId: "c1", valueCents: 400_000, completedOn: "2026-01-08" }),
    ];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs, plans: [], now: NOW });
    const rec = columns.find((c) => c.recurring)!;
    expect(rec.customers).toHaveLength(1);
    expect(rec.customers[0].jobCount).toBe(3);
    expect(rec.customers[0].totalCents).toBe(910_000);
    expect(rec.customers[0].lastJobOn).toBe("2026-07-02");
    expect(rec.customers[0].firstJobOn).toBe("2026-01-08");
  });

  it("totals a column from the customers currently sitting in it", () => {
    const opps = [
      opp({ id: "o1", contactId: "c1", pipelineStageId: "st_rec" }),
      opp({ id: "o2", contactId: "c2", pipelineStageId: "st_rec" }),
      opp({ id: "o3", contactId: "c3", pipelineStageId: "st_one" }),
    ];
    const jobs = [
      job({ ghlContactId: "c1", valueCents: 500_00 }),
      job({ ghlContactId: "c2", valueCents: 250_00 }),
      job({ ghlContactId: "c3", valueCents: 100_00 }),
    ];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs, plans: [], now: NOW });
    const one = columns.find((c) => !c.recurring)!;
    const rec = columns.find((c) => c.recurring)!;
    expect(one.count).toBe(1);
    expect(one.totalCents).toBe(100_00);
    expect(rec.count).toBe(2);
    expect(rec.totalCents).toBe(750_00);
  });

  it("keeps a customer with no logged jobs, honestly at zero", () => {
    // Someone Jake dropped into the pipeline by hand. They are a real customer;
    // we simply have no work recorded for them yet.
    const opps = [opp({ id: "o1", contactId: "c1", contact: { id: "c1", name: "Kim Talbot" } })];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs: [], plans: [], now: NOW });
    const one = columns.find((c) => !c.recurring)!;
    expect(one.customers[0].jobCount).toBe(0);
    expect(one.customers[0].totalCents).toBe(0);
    expect(one.customers[0].lastJobOn).toBeNull();
    expect(one.totalCents).toBe(0);
  });

  it("ignores job rows whose customer is no longer in the pipeline", () => {
    // The opportunity was deleted in GHL but our rows survive. They must never
    // reach a tile, or the tiles stop reconciling with the columns below them.
    const opps = [opp({ id: "o1", contactId: "c1" })];
    const jobs = [
      job({ ghlContactId: "c1", valueCents: 100_00 }),
      job({ ghlContactId: "c_ghost", valueCents: 999_00 }),
    ];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs, plans: [], now: NOW });
    const total = columns.reduce((sum, c) => sum + c.totalCents, 0);
    expect(total).toBe(100_00);
  });

  it("renders an unexpected third stage as its own column rather than swallowing its customers", () => {
    const stages = [...STAGES, { id: "st_vip", name: "VIP Customer ⭐" }];
    const opps = [opp({ id: "o1", contactId: "c1", pipelineStageId: "st_vip" })];
    const jobs = [job({ ghlContactId: "c1", valueCents: 700_00 })];
    const { columns } = buildCustomers({ opps, stages, jobs, plans: [], now: NOW });
    expect(columns).toHaveLength(3);
    const vip = columns.find((c) => c.id === "st_vip")!;
    expect(vip.recurring).toBe(false);
    expect(vip.customers).toHaveLength(1);
    expect(vip.totalCents).toBe(700_00);
  });

  it("drops an opportunity sitting in a stage the pipeline no longer has", () => {
    const opps = [opp({ id: "o1", contactId: "c1", pipelineStageId: "st_deleted" })];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs: [], plans: [], now: NOW });
    expect(columns.every((c) => c.customers.length === 0)).toBe(true);
  });

  it("shows one card per contact, keeping the freshest, if GHL ever holds duplicates", () => {
    // Design forbids this (close-out moves or parks, never duplicates), but a
    // hand-made card in GHL could still produce it, and double-counting a
    // customer's revenue is worse than picking one.
    const opps = [
      opp({ id: "o_old", contactId: "c1", pipelineStageId: "st_one", updatedAt: "2026-01-01T00:00:00.000Z" }),
      opp({ id: "o_new", contactId: "c1", pipelineStageId: "st_rec", updatedAt: "2026-07-01T00:00:00.000Z" }),
    ];
    const jobs = [job({ ghlContactId: "c1", valueCents: 300_00 })];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs, plans: [], now: NOW });
    const one = columns.find((c) => !c.recurring)!;
    const rec = columns.find((c) => c.recurring)!;
    expect(one.customers).toHaveLength(0);
    expect(rec.customers).toHaveLength(1);
    expect(rec.customers[0].opportunityId).toBe("o_new");
    expect(rec.totalCents).toBe(300_00);
  });

  it("attaches the next-service state to a recurring customer", () => {
    const opps = [opp({ id: "o1", contactId: "c1", pipelineStageId: "st_rec" })];
    const plans: ServicePlanRow[] = [
      { ghlContactId: "c1", nextServiceAt: "2026-07-12T13:00:00.000Z", status: "booked", ghlAppointmentId: "a1" },
    ];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs: [], plans, now: NOW });
    const rec = columns.find((c) => c.recurring)!;
    expect(rec.customers[0].serviceState).toBe("overdue");
    expect(rec.customers[0].nextServiceAt).toBe("2026-07-12T13:00:00.000Z");
  });

  it("sorts customers by their most recent job, newest first", () => {
    const opps = [
      opp({ id: "o1", contactId: "c1" }),
      opp({ id: "o2", contactId: "c2" }),
      opp({ id: "o3", contactId: "c3" }),
    ];
    const jobs = [
      job({ ghlContactId: "c1", completedOn: "2026-06-01" }),
      job({ ghlContactId: "c2", completedOn: "2026-07-05" }),
      job({ ghlContactId: "c3", completedOn: "2026-05-01" }),
    ];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs, plans: [], now: NOW });
    const one = columns.find((c) => !c.recurring)!;
    expect(one.customers.map((c) => c.contactId)).toEqual(["c2", "c1", "c3"]);
  });

  it("sorts a customer with no jobs last rather than first", () => {
    const opps = [
      opp({ id: "o1", contactId: "c_none" }),
      opp({ id: "o2", contactId: "c_has" }),
    ];
    const jobs = [job({ ghlContactId: "c_has", completedOn: "2026-05-01" })];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs, plans: [], now: NOW });
    const one = columns.find((c) => !c.recurring)!;
    expect(one.customers.map((c) => c.contactId)).toEqual(["c_has", "c_none"]);
  });

  it("falls back to Unknown when the contact behind an opportunity is gone", () => {
    const opps = [opp({ id: "o1", contactId: "c1", name: undefined })];
    const { columns } = buildCustomers({ opps, stages: STAGES, jobs: [], plans: [], now: NOW });
    const one = columns.find((c) => !c.recurring)!;
    expect(one.customers[0].name).toBe("Unknown");
  });
});
