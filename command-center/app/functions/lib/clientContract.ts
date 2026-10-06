// The client's contract terms (0148), behind Management's Contract rail.
//
// Pure shaping only: the row <-> wire mapping, the PATCH whitelist, and what
// Claude is asked for when it reads the PDF plus the guard that proves its
// answer has every part. The handlers under api/admin/clients/:id/contract/
// own the I/O.
//
// A term the contract does not state stays empty (null or ""), never zero: a
// $0 setup fee and "no setup fee mentioned" are different facts.

export interface ContractDto {
  fileName: string;
  hasFile: boolean;
  uploadedAt: string | null;
  readAt: string | null;
  lengthMonths: number | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  monthlyFee: number | null; // whole dollars
  setupFee: number | null;
  payment: string;
  noticeDays: number | null;
  autoRenew: string;
  adSpend: string;
  guarantee: string;
  clauses: string[];
}

export interface ContractRow {
  contract_file_path: string | null;
  contract_file_name: string | null;
  contract_uploaded_at: string | null;
  contract_read_at: string | null;
  contract_length_months: number | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_monthly_fee: number | null;
  contract_setup_fee: number | null;
  contract_payment: string | null;
  contract_notice_days: number | null;
  contract_auto_renew: string | null;
  contract_ad_spend: string | null;
  contract_guarantee: string | null;
  contract_clauses: unknown;
}

export const CONTRACT_COLUMNS =
  "contract_file_path, contract_file_name, contract_uploaded_at, contract_read_at, " +
  "contract_length_months, contract_start, contract_end, contract_monthly_fee, " +
  "contract_setup_fee, contract_payment, contract_notice_days, contract_auto_renew, " +
  "contract_ad_spend, contract_guarantee, contract_clauses";

export const CONTRACT_BUCKET = "client-contracts";
export const CONTRACT_MAX_BYTES = 15 * 1024 * 1024;

const TEXT_MAX = 300;
const CLAUSE_MAX = 300;
const CLAUSES_MAX = 8;

export function emptyContractDto(): ContractDto {
  return {
    fileName: "",
    hasFile: false,
    uploadedAt: null,
    readAt: null,
    lengthMonths: null,
    startDate: null,
    endDate: null,
    monthlyFee: null,
    setupFee: null,
    payment: "",
    noticeDays: null,
    autoRenew: "",
    adSpend: "",
    guarantee: "",
    clauses: [],
  };
}

export function toContractDto(row: ContractRow): ContractDto {
  return {
    fileName: row.contract_file_name ?? "",
    hasFile: Boolean((row.contract_file_path ?? "").trim()),
    uploadedAt: row.contract_uploaded_at ?? null,
    readAt: row.contract_read_at ?? null,
    lengthMonths: row.contract_length_months ?? null,
    startDate: row.contract_start ?? null,
    endDate: row.contract_end ?? null,
    monthlyFee: row.contract_monthly_fee ?? null,
    setupFee: row.contract_setup_fee ?? null,
    payment: row.contract_payment ?? "",
    noticeDays: row.contract_notice_days ?? null,
    autoRenew: row.contract_auto_renew ?? "",
    adSpend: row.contract_ad_spend ?? "",
    guarantee: row.contract_guarantee ?? "",
    clauses: cleanClauses(row.contract_clauses),
  };
}

// A storage path the read and file routes accept: inside this tenant's folder,
// a random name, a .pdf. Anything else is refused, so a body can never point
// the signer at another client's contract.
export function isTenantContractPath(tenantId: string, path: unknown): path is string {
  if (typeof path !== "string") return false;
  const m = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.pdf$/.exec(path);
  return Boolean(m && m[1] === tenantId);
}

// The upload name shown on the rail. Path separators and control characters
// out, length capped, and it always ends in .pdf.
export function cleanFileName(name: unknown): string {
  const base = String(name ?? "")
    .replace(/[\\/]/g, " ")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 120);
  if (!base) return "Contract.pdf";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar date in YYYY-MM-DD, or null. "2026-02-30" is not a date.
export function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = ISO.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return m[0];
}

// start + N months, clamped to the month's last day (Jan 31 + 1 = Feb 28).
export function addMonths(start: string, months: number): string {
  const m = ISO.exec(start)!;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const day = Number(m[3]);
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, mo, Math.min(day, last)));
  return d.toISOString().slice(0, 10);
}

function intOrNull(v: unknown, max: number): number | null | "bad" {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return "bad";
  return Math.round(n);
}

function text(v: unknown): string {
  return String(v ?? "").trim().slice(0, TEXT_MAX);
}

function cleanClauses(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().slice(0, CLAUSE_MAX))
    .filter(Boolean)
    .slice(0, CLAUSES_MAX);
}

export type ContractUpdateResult =
  | { ok: true; update: Record<string, unknown> }
  | { ok: false; error: string };

const INT_FIELDS: [string, string, number][] = [
  ["lengthMonths", "contract_length_months", 600],
  ["monthlyFee", "contract_monthly_fee", 10_000_000],
  ["setupFee", "contract_setup_fee", 10_000_000],
  ["noticeDays", "contract_notice_days", 3650],
];
const TEXT_FIELDS: [string, string][] = [
  ["payment", "contract_payment"],
  ["autoRenew", "contract_auto_renew"],
  ["adSpend", "contract_ad_spend"],
  ["guarantee", "contract_guarantee"],
];
const DATE_FIELDS: [string, string][] = [
  ["startDate", "contract_start"],
  ["endDate", "contract_end"],
];

// Whitelist a PATCH body (the rail's Edit) into a snake_case update. Only keys
// that are present change. Blank clears a term.
export function buildContractUpdate(body: unknown): ContractUpdateResult {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid body" };
  const input = body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  for (const [key, column, max] of INT_FIELDS) {
    if (!(key in input)) continue;
    const n = intOrNull(input[key], max);
    if (n === "bad") return { ok: false, error: `${key} must be a whole number` };
    update[column] = n;
  }
  for (const [key, column] of DATE_FIELDS) {
    if (!(key in input)) continue;
    const raw = input[key];
    if (raw === null || raw === "") {
      update[column] = null;
      continue;
    }
    const d = isoDateOrNull(raw);
    if (!d) return { ok: false, error: `${key} must be a date` };
    update[column] = d;
  }
  for (const [key, column] of TEXT_FIELDS) {
    if (key in input) update[column] = text(input[key]);
  }
  if ("clauses" in input) update.contract_clauses = cleanClauses(input.clauses);

  if (Object.keys(update).length === 0) return { ok: false, error: "no fields to update" };
  return { ok: true, update };
}

// ---------------------------------------------------------------------------
// Reading the PDF with Claude
// ---------------------------------------------------------------------------

export interface ContractRead {
  isContract: boolean;
  lengthMonths: number | null;
  startDate: string;
  endDate: string;
  monthlyFee: number | null;
  setupFee: number | null;
  payment: string;
  noticeDays: number | null;
  autoRenew: string;
  adSpend: string;
  guarantee: string;
  clauses: string[];
}

const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };

export const CONTRACT_READ_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "isContract",
    "lengthMonths",
    "startDate",
    "endDate",
    "monthlyFee",
    "setupFee",
    "payment",
    "noticeDays",
    "autoRenew",
    "adSpend",
    "guarantee",
    "clauses",
  ],
  properties: {
    isContract: { type: "boolean" },
    lengthMonths: nullableInt,
    startDate: { type: "string" },
    endDate: { type: "string" },
    monthlyFee: nullableInt,
    setupFee: nullableInt,
    payment: { type: "string" },
    noticeDays: nullableInt,
    autoRenew: { type: "string" },
    adSpend: { type: "string" },
    guarantee: { type: "string" },
    clauses: { type: "array", items: { type: "string" } },
  },
};

export const CONTRACT_READ_SYSTEM = `You read service agreements between Hauck Marketing (a Facebook ads agency for local home-service businesses) and one of its clients, and pull out the commercial terms.

Rules:
- Only report what the document actually says. If a term is not stated, use null for numbers and "" for text. Never guess or fill in a typical value.
- isContract is false if the document is not a service agreement or contract at all.
- Money is whole US dollars, no cents. monthlyFee is the agency's recurring fee per month. setupFee is any one-time onboarding or setup fee.
- lengthMonths is the minimum or initial term in months. A 90 day term is 3.
- Dates are YYYY-MM-DD. startDate is when the service or term begins (use the signing or effective date if that is what starts it). endDate is when the initial term ends; leave it "" if the document does not give it directly.
- noticeDays is the written notice needed to cancel, in days. 30 days = 30, one month = 30.
- payment: how and when the client pays, in a few words (for example "Card, billed on the 1st").
- autoRenew: what happens after the term, in a few words (for example "Month to month", "Renews for 3 months", "Ends, no renewal").
- adSpend: any ad spend the client commits to, in a few words, and who pays it.
- guarantee: any performance guarantee and its remedy, in one short sentence.
- clauses: up to 6 other terms that matter to running the account (cancellation penalties, refunds, ownership of ad accounts or creative, exclusivity), each one short plain-English sentence. No legal boilerplate.
- Plain words. No em dashes.`;

function isIntOrNull(v: unknown): boolean {
  return v === null || (typeof v === "number" && Number.isInteger(v));
}

export function isContractRead(v: unknown): v is ContractRead {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.isContract === "boolean" &&
    isIntOrNull(r.lengthMonths) &&
    isIntOrNull(r.monthlyFee) &&
    isIntOrNull(r.setupFee) &&
    isIntOrNull(r.noticeDays) &&
    typeof r.startDate === "string" &&
    typeof r.endDate === "string" &&
    typeof r.payment === "string" &&
    typeof r.autoRenew === "string" &&
    typeof r.adSpend === "string" &&
    typeof r.guarantee === "string" &&
    Array.isArray(r.clauses) &&
    r.clauses.every((c) => typeof c === "string")
  );
}

// What a read writes to the row. Out-of-range numbers and non-dates are
// dropped to empty rather than trusted. End is worked out from start + length
// when the contract only gives those two, which is how most of them are written.
export function contractUpdateFromRead(read: ContractRead): Record<string, unknown> {
  const int = (v: number | null, max: number) => {
    const n = intOrNull(v, max);
    return n === "bad" ? null : n;
  };
  const lengthMonths = int(read.lengthMonths, 600);
  const start = isoDateOrNull(read.startDate);
  let end = isoDateOrNull(read.endDate);
  if (!end && start && lengthMonths) end = addMonths(start, lengthMonths);

  return {
    contract_length_months: lengthMonths,
    contract_start: start,
    contract_end: end,
    contract_monthly_fee: int(read.monthlyFee, 10_000_000),
    contract_setup_fee: int(read.setupFee, 10_000_000),
    contract_payment: text(read.payment),
    contract_notice_days: int(read.noticeDays, 3650),
    contract_auto_renew: text(read.autoRenew),
    contract_ad_spend: text(read.adSpend),
    contract_guarantee: text(read.guarantee),
    contract_clauses: cleanClauses(read.clauses).slice(0, 6),
  };
}
