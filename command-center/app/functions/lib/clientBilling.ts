// Server-side shaping for the per-client billing record behind
// GET/PATCH /api/admin/clients/:tenantId/billing.
//
// Kept out of the handler so the whitelist (which fields a PATCH may touch, and
// what counts as valid) is pure and unit-tested. Phase 1 is manual entry: cash
// is whole non-negative dollars, the date fields are free text, and `status` is
// the only enum. The UI already coerces, but the server re-validates because it
// is the boundary.

export const BILLING_STATUSES = ["active", "churned"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

// The camelCase wire shape the client reads.
export interface BillingDto {
  source: string;
  dateClosed: string;
  service: string;
  paymentArrangement: string;
  upfrontCash: number;
  remainingCash: number;
  totalCashCollected: number;
  billingDate: string;
  renewalDate: string;
  lastTouchpoint: string;
  churnDate: string;
  status: BillingStatus;
  notes: string;
  updatedAt: string | null;
}

// The client_billing row as Postgres holds it.
export interface BillingRow {
  source: string;
  date_closed: string;
  service: string;
  payment_arrangement: string;
  upfront_cash: number;
  remaining_cash: number;
  total_cash_collected: number;
  billing_date: string;
  renewal_date: string;
  last_touchpoint: string;
  churn_date: string;
  status: string;
  notes: string;
  updated_at: string | null;
}

// What a client with no saved row looks like: empty fields, zero cash, active.
// Returned on read rather than inserted, so merely opening the tab does not
// create rows for every client.
export function emptyBillingDto(): BillingDto {
  return {
    source: "",
    dateClosed: "",
    service: "",
    paymentArrangement: "",
    upfrontCash: 0,
    remainingCash: 0,
    totalCashCollected: 0,
    billingDate: "",
    renewalDate: "",
    lastTouchpoint: "",
    churnDate: "",
    status: "active",
    notes: "",
    updatedAt: null,
  };
}

export function toBillingDto(row: BillingRow): BillingDto {
  return {
    source: row.source ?? "",
    dateClosed: row.date_closed ?? "",
    service: row.service ?? "",
    paymentArrangement: row.payment_arrangement ?? "",
    upfrontCash: row.upfront_cash ?? 0,
    remainingCash: row.remaining_cash ?? 0,
    totalCashCollected: row.total_cash_collected ?? 0,
    billingDate: row.billing_date ?? "",
    renewalDate: row.renewal_date ?? "",
    lastTouchpoint: row.last_touchpoint ?? "",
    churnDate: row.churn_date ?? "",
    status: isBillingStatus(row.status) ? row.status : "active",
    notes: row.notes ?? "",
    updatedAt: row.updated_at ?? null,
  };
}

export function isBillingStatus(v: unknown): v is BillingStatus {
  return typeof v === "string" && (BILLING_STATUSES as readonly string[]).includes(v);
}

// camelCase body key -> snake_case column, for the free-text fields. An empty
// string is a legitimate value here: it clears the field.
const TEXT_FIELDS: Record<string, string> = {
  source: "source",
  dateClosed: "date_closed",
  service: "service",
  paymentArrangement: "payment_arrangement",
  billingDate: "billing_date",
  renewalDate: "renewal_date",
  lastTouchpoint: "last_touchpoint",
  churnDate: "churn_date",
  notes: "notes",
};

const CASH_FIELDS: Record<string, string> = {
  upfrontCash: "upfront_cash",
  remainingCash: "remaining_cash",
  totalCashCollected: "total_cash_collected",
};

export type BillingUpdateResult =
  | { ok: true; update: Record<string, unknown> }
  | { ok: false; error: string };

// Whitelist a PATCH body into a snake_case update. Only supplied fields change;
// unknown keys are dropped rather than written. Cash must be a finite,
// non-negative number (rounded to whole dollars); status must be in the enum.
export function buildBillingUpdate(body: unknown): BillingUpdateResult {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const input = body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  for (const [key, column] of Object.entries(TEXT_FIELDS)) {
    const value = input[key];
    if (typeof value === "string") update[column] = value.trim();
  }

  for (const [key, column] of Object.entries(CASH_FIELDS)) {
    if (input[key] === undefined) continue;
    const n = Number(input[key]);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${key} must be a non-negative number` };
    }
    update[column] = Math.round(n);
  }

  if (input.status !== undefined) {
    if (!isBillingStatus(input.status)) return { ok: false, error: "invalid status" };
    update.status = input.status;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "no fields to update" };
  }
  return { ok: true, update };
}
