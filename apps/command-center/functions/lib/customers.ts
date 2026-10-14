// The Customers surface: who has actually paid us, and what for.
//
// Split of truth (see docs/build-plans/customers-page.md):
//
//   GHL  owns the RELATIONSHIP. One opportunity per contact in the client's
//        "Customers" pipeline; its STAGE is the customer's type. Nothing about a
//        customer lives in GHL beyond that card.
//   Us   own the WORK. customer_jobs rows, because a GHL opportunity carries one
//        monetaryValue and a recurring customer has many jobs.
//
// Everything the page shows (counts, revenue, job history) is DERIVED here from
// those two sources at read time, never stored. That is what keeps a tile
// reconciled with the column beneath it: move someone One-Time -> Recurring in
// GHL and their whole revenue moves with them, because the stage is the only
// thing that decides which column they are counted in.
//
// Pure and side-effect free on purpose: every rule below is unit-tested in
// customers.test.ts without touching GHL or Supabase.

import { shapeOpportunity, type GhlOpportunity } from "./ghl";

export interface PipelineLike {
  id: string;
  name: string;
  stages: StageLike[];
}

export interface StageLike {
  id: string;
  name: string;
  color?: string;
}

// A customer_jobs row, already camel-cased out of Supabase.
export interface CustomerJobRow {
  id: string;
  ghlContactId: string;
  description: string;
  valueCents: number;
  completedOn: string; // YYYY-MM-DD, no time, no timezone
  sourceOpportunityId: string | null;
}

// A customer_service_plan row. `status` carries the three real cases a nullable
// date cannot distinguish; see the 0029 migration.
export interface ServicePlanRow {
  ghlContactId: string;
  nextServiceAt: string | null;
  status: "booked" | "unplanned" | "none";
  ghlAppointmentId: string | null;
}

// What the page renders per next-service line. `overdue` and `unplanned` both go
// amber; `none` is deliberately silent (recurring, but nothing due).
export type ServiceState = "booked" | "overdue" | "unplanned" | "none";

export interface ApiCustomer {
  contactId: string;
  opportunityId: string;
  name: string;
  phone: string;
  email: string;
  stageId: string;
  stageName: string;
  jobCount: number;
  totalCents: number;
  lastJobOn: string | null;
  firstJobOn: string | null;
  nextServiceAt: string | null;
  serviceState: ServiceState | null;
}

export interface ApiCustomerColumn {
  id: string;
  name: string;
  color: string | null;
  // Drives the rich treatment (job count, since-date, next-service line). Any
  // stage the client adds later that is not "recurring" renders as a plain list.
  recurring: boolean;
  count: number;
  totalCents: number;
  customers: ApiCustomer[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve the Customers pipeline BY NAME, exact first then contains, per the
// house rule: ids differ per tenant and a client rename must not break the page.
// Willis's live stage names carry emoji ("Recurring Customer 🔁"), so nothing
// here may match on equality.
export function resolveCustomersPipeline(pipes: PipelineLike[]): PipelineLike | null {
  return (
    pipes.find((p) => norm(p.name) === "customers") ??
    pipes.find((p) => norm(p.name).includes("customer")) ??
    null
  );
}

export function isRecurringStage(stageName: string): boolean {
  return norm(stageName).includes("recurring");
}

// GHL's monetaryValue is float dollars; we store integer cents.
//
// The toFixed(2) is load-bearing, not decoration: `1.005 * 100` is
// 100.49999999999999 in IEEE 754, so a bare Math.round shaves a cent off the
// exact half. Normalising through a fixed-precision string first settles the
// artefact, then we round. These cents are summed into the client's revenue
// tiles, so a cent lost here is a cent wrong on the page.
export function centsFromMoney(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(Number((value * 100).toFixed(2)));
}

export function moneyFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function serviceStateFor(
  plan: ServicePlanRow | null | undefined,
  now: Date,
): ServiceState | null {
  if (!plan) return null;
  if (plan.status === "none") return "none";
  if (plan.status === "unplanned") return "unplanned";
  // status === "booked". A date with no appointment behind it means the calendar
  // write failed after the job saved: we kept the date but must chase it rather
  // than claim a booking that does not exist.
  if (!plan.nextServiceAt || !plan.ghlAppointmentId) return "unplanned";
  return new Date(plan.nextServiceAt).getTime() < now.getTime() ? "overdue" : "booked";
}

interface BuildInput {
  opps: GhlOpportunity[];
  stages: StageLike[];
  jobs: CustomerJobRow[];
  plans: ServicePlanRow[];
  now: Date;
}

// One card per contact. The design forbids duplicates (close-out moves or parks
// an opportunity, never copies it), but a card made by hand in GHL could still
// produce two. Double-counting a customer's revenue is worse than picking one,
// so the freshest card wins.
function newestByContact(opps: GhlOpportunity[]): Map<string, GhlOpportunity> {
  const byContact = new Map<string, GhlOpportunity>();
  for (const o of opps) {
    const contactId = o.contact?.id ?? o.contactId ?? "";
    if (!contactId) continue;
    const held = byContact.get(contactId);
    if (!held || freshness(o) > freshness(held)) byContact.set(contactId, o);
  }
  return byContact;
}

function freshness(o: GhlOpportunity): number {
  const raw = o.lastStatusChangeAt ?? o.updatedAt ?? o.createdAt ?? "";
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function buildCustomers(input: BuildInput): { columns: ApiCustomerColumn[] } {
  const { opps, stages, jobs, plans, now } = input;

  const jobsByContact = new Map<string, CustomerJobRow[]>();
  for (const j of jobs) {
    const list = jobsByContact.get(j.ghlContactId);
    if (list) list.push(j);
    else jobsByContact.set(j.ghlContactId, [j]);
  }

  const planByContact = new Map<string, ServicePlanRow>();
  for (const p of plans) planByContact.set(p.ghlContactId, p);

  // Columns come from the stages GHL actually returns, in their given order, so
  // a third stage added later renders as its own column instead of silently
  // swallowing the customers standing in it.
  const columns: ApiCustomerColumn[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? null,
    recurring: isRecurringStage(s.name),
    count: 0,
    totalCents: 0,
    customers: [],
  }));
  const byStageId = new Map(columns.map((c) => [c.id, c]));

  for (const [contactId, o] of newestByContact(opps)) {
    // An opportunity parked in a stage the pipeline no longer has belongs
    // nowhere. Dropping it keeps every tile equal to the column beneath it.
    const column = byStageId.get(o.pipelineStageId ?? "");
    if (!column) continue;

    const shaped = shapeOpportunity(o);
    const mine = (jobsByContact.get(contactId) ?? [])
      .slice()
      .sort((a, b) => b.completedOn.localeCompare(a.completedOn));
    const totalCents = mine.reduce((sum, j) => sum + j.valueCents, 0);
    const plan = planByContact.get(contactId) ?? null;

    column.customers.push({
      contactId,
      opportunityId: shaped.id,
      name: shaped.name,
      phone: shaped.phone,
      email: shaped.email,
      stageId: column.id,
      stageName: column.name,
      jobCount: mine.length,
      totalCents,
      lastJobOn: mine[0]?.completedOn ?? null,
      firstJobOn: mine[mine.length - 1]?.completedOn ?? null,
      nextServiceAt: plan?.nextServiceAt ?? null,
      serviceState: serviceStateFor(plan, now),
    });
    column.count += 1;
    column.totalCents += totalCents;
  }

  // Most recent work first. A customer with nothing logged sorts last: they are
  // real, but there is nothing to be recent about.
  for (const c of columns) {
    c.customers.sort((a, b) => (b.lastJobOn ?? "").localeCompare(a.lastJobOn ?? ""));
  }

  // Recurring leads, whatever order GHL keeps its stages in (live Willis has
  // One-Time at position 0). Recurring customers are the ones worth attention and
  // the only ones carrying a next-service date, so they get the first, widest
  // column. Ordering lives here rather than in the page so the demo fixture and
  // the real response can never disagree about it.
  columns.sort((a, b) => Number(b.recurring) - Number(a.recurring));

  return { columns };
}
