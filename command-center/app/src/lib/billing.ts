// Pure helpers behind the Fulfillment cockpit's Billing tab
// (/admin/delivery/:tenantId?tab=billing). No React, no router, no Date.now():
// "now" is always injected so the near-billing-date hint is deterministic and
// unit-testable.
//
// Phase 1 is manual entry. Cash is whole dollars (integers); the four date
// fields are free text, typed exactly as the deal notes read, so nothing is
// coerced into a format Jake did not write.

import type { AdminClientBilling, AdminClientBillingPatch } from "./api";

// The Billing tab's form state: every field is a string as typed, including
// the cash inputs (so a half-typed "1,2" stays on screen). sanitizeBillingPatch
// turns this into the PATCH body.
export interface BillingForm {
  source: string;
  dateClosed: string;
  service: string;
  paymentArrangement: string;
  upfrontCash: string;
  remainingCash: string;
  totalCashCollected: string;
  billingDate: string;
  renewalDate: string;
  lastTouchpoint: string;
  churnDate: string;
  status: "active" | "churned";
  notes: string;
}

// A blank record: what a client with no billing row yet shows. Empty fields,
// never fabricated numbers.
export function emptyBillingForm(): BillingForm {
  return {
    source: "",
    dateClosed: "",
    service: "",
    paymentArrangement: "",
    upfrontCash: "",
    remainingCash: "",
    totalCashCollected: "",
    billingDate: "",
    renewalDate: "",
    lastTouchpoint: "",
    churnDate: "",
    status: "active",
    notes: "",
  };
}

// Seed the form from a loaded record. Cash renders grouped ("2,000"); a zero
// shows as blank rather than a misleading "0" the admin did not type.
export function billingFormFrom(billing: AdminClientBilling): BillingForm {
  return {
    source: billing.source,
    dateClosed: billing.dateClosed,
    service: billing.service,
    paymentArrangement: billing.paymentArrangement,
    upfrontCash: billing.upfrontCash ? formatMoney(billing.upfrontCash) : "",
    remainingCash: billing.remainingCash ? formatMoney(billing.remainingCash) : "",
    totalCashCollected: billing.totalCashCollected
      ? formatMoney(billing.totalCashCollected)
      : "",
    billingDate: billing.billingDate,
    renewalDate: billing.renewalDate,
    lastTouchpoint: billing.lastTouchpoint,
    churnDate: billing.churnDate,
    status: billing.status,
    notes: billing.notes,
  };
}

// Read a typed money cell as whole dollars. Digits only: "$1,500" -> 1500. A
// minus sign is not a digit, so this can never return a negative, which is the
// clamp the server re-checks. Blank or wordy input -> 0.
export function parseMoneyInput(raw: string): number {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

// Render whole dollars with thousands separators (no "$": the field draws its
// own prefix).
export function formatMoney(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

// How close a billing date is, when it parses as a real date and lands inside
// the next week. Returns null for blank text, free text ("Net 30"), a date
// already gone, or one further out than 7 days, so the amber highlight only
// ever means "this is imminent".
export interface BillingDateHint {
  days: number;
  label: string;
}

const HINT_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parse a typed date to LOCAL midnight, or null. The two forms Jake types parse
// under different rules in JS: "2026-07-20" is treated as UTC midnight while
// "Jul 22, 2026" is treated as local midnight. Left alone, that reads an ISO
// date as the previous day everywhere west of UTC. Build the ISO form from its
// parts so both paths land on the same local midnight.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(text: string): Date | null {
  const iso = ISO_DATE.exec(text);
  const parsed = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function billingDateHint(text: string, now: Date): BillingDateHint | null {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  // Require a 4 digit year so a bare "22" or "3" is never read as a date.
  if (!/\d{4}/.test(trimmed)) return null;

  const parsed = parseLocalDate(trimmed);
  if (!parsed) return null;

  // Compare calendar days, not instants, so a time-of-day never shifts the count.
  const target = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / MS_PER_DAY);

  if (days < 0 || days > HINT_WINDOW_DAYS) return null;
  if (days === 0) return { days, label: "TODAY" };
  return { days, label: `IN ${days} ${days === 1 ? "DAY" : "DAYS"}` };
}

const STATUSES: BillingForm["status"][] = ["active", "churned"];

// Turn the form into the PATCH body: text trimmed (empty clears the field on
// the server), cash coerced to whole-dollar integers, status defaulted.
export function sanitizeBillingPatch(form: BillingForm): AdminClientBillingPatch {
  const text = (v: string) => String(v ?? "").trim();
  return {
    source: text(form.source),
    dateClosed: text(form.dateClosed),
    service: text(form.service),
    paymentArrangement: text(form.paymentArrangement),
    upfrontCash: parseMoneyInput(form.upfrontCash),
    remainingCash: parseMoneyInput(form.remainingCash),
    totalCashCollected: parseMoneyInput(form.totalCashCollected),
    billingDate: text(form.billingDate),
    renewalDate: text(form.renewalDate),
    lastTouchpoint: text(form.lastTouchpoint),
    churnDate: text(form.churnDate),
    status: STATUSES.includes(form.status) ? form.status : "active",
    notes: text(form.notes),
  };
}
