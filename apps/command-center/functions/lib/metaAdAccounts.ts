import { graphGetAll } from "./metaGraph";

// The ad accounts the agency's one System-User token can actually see, shaped
// for the admin "link the ads manager" picker.
//
// Linking a client used to mean going to Business Manager, finding the account
// number, and pasting act_... into a text box. But the token already knows the
// answer: GET /me/adaccounts returns every account the system user has been
// granted, and a single nested insights edge brings back last-30-day spend in
// the same call, which is what makes the right account obvious on sight.
//
// Read-only, and deliberately narrow: `business` and /me/businesses both need
// business_management, which this token does not carry. "Accounts assigned to
// the agency system user" is the correct set regardless: an account the token
// cannot see is one the client's Paid Ads could never read either.

// One row as Graph returns it. Every field is optional: a brand new account can
// come back with little more than an id, and a picker that throws on that is
// worse than one that shows a bare id.
export interface GraphAdAccount {
  id?: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  insights?: { data?: { spend?: string; impressions?: string }[] };
}

// The tenant columns the guard needs. Nothing secret: an id, a name, and the
// account the client is already on.
export interface LinkedTenant {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
}

export type AdAccountStatus =
  | "active"
  | "disabled"
  | "unsettled"
  | "pending"
  | "closed"
  | "unknown";

export interface AdAccountOption {
  /** Canonical act_ id, which is what gets stored on the tenant row. */
  id: string;
  /** Bare digits, shown next to the name. */
  accountId: string;
  name: string;
  status: AdAccountStatus;
  currency: string;
  timezone: string;
  spend30d: number;
  impressions30d: number;
  /** The client currently holding this account, if any. */
  linkedTenantId: string | null;
  linkedTenantName: string | null;
  /** True when that client is the one being edited (already linked, not taken). */
  linkedToThisClient: boolean;
}

// What GET /api/admin/meta/ad-accounts answers. Lives here rather than in the
// endpoint so the picker and the handler cannot disagree about the shape (and
// so the browser never has to import a Pages Function module).
export interface AdAccountsResponse {
  /** Whether the agency system-user token exists at all. */
  configured: boolean;
  accounts: AdAccountOption[];
  /** Present when Meta refused; the picker shows it rather than an empty shrug. */
  error?: string;
}

// Name, ids, currency, timezone and last-30-day spend in one request.
export const AD_ACCOUNT_FIELDS =
  "name,account_id,account_status,currency,timezone_name,insights.date_preset(last_30d){spend,impressions}";

// Meta's account_status numbers, named. Anything unrecognised reads "unknown"
// rather than being guessed at: the picker only ever warns on what it knows.
const STATUS: Record<number, AdAccountStatus> = {
  1: "active",
  2: "disabled",
  3: "unsettled",
  7: "pending",
  8: "pending",
  9: "active", // in grace period: still delivering
  100: "closed",
  101: "closed",
  201: "active",
  202: "closed",
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

// "act_123", "123", " 123 " and "ACT_123" are the same account. Tenant rows
// predate the act_ normalising, so comparing raw strings would offer an account
// that another client already holds.
function canonical(v: string | null | undefined): string {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "";
  const digits = s.replace(/^act_/, "");
  return digits ? `act_${digits}` : "";
}

/**
 * Shape the Graph rows into picker options, marking which client (if any)
 * already holds each account.
 *
 * Ordered for the click: the account this client is already on first, then the
 * free accounts with the most recent spend (a live account is almost always the
 * one being linked), then the accounts another client holds, which are the ones
 * that must never be picked by accident.
 */
export function shapeAdAccounts(
  rows: GraphAdAccount[],
  tenants: LinkedTenant[],
  tenantId: string,
): AdAccountOption[] {
  const holders = new Map<string, LinkedTenant>();
  for (const t of tenants) {
    const key = canonical(t.meta_ad_account_id);
    if (key && !holders.has(key)) holders.set(key, t);
  }

  const options = rows.map((r) => {
    const accountId = (r.account_id ?? "").trim() || canonical(r.id).replace(/^act_/, "");
    const id = canonical(r.id) || canonical(accountId);
    const insight = r.insights?.data?.[0];
    const holder = holders.get(id) ?? null;
    return {
      id,
      accountId,
      name: (r.name ?? "").trim() || id,
      status: STATUS[r.account_status ?? -1] ?? "unknown",
      currency: (r.currency ?? "USD").trim() || "USD",
      timezone: (r.timezone_name ?? "").trim(),
      spend30d: Math.round(num(insight?.spend) * 100) / 100,
      impressions30d: Math.round(num(insight?.impressions)),
      linkedTenantId: holder?.id ?? null,
      linkedTenantName: holder?.id === tenantId ? null : (holder?.name ?? null),
      linkedToThisClient: holder?.id === tenantId,
    } satisfies AdAccountOption;
  });

  const rank = (o: AdAccountOption) =>
    o.linkedToThisClient ? 0 : o.linkedTenantId ? 2 : 1;
  return options.sort((a, b) => rank(a) - rank(b) || b.spend30d - a.spend30d);
}

/** Every ad account the system-user token can see. Paged, read-only. */
export async function fetchAdAccounts(token: string): Promise<GraphAdAccount[]> {
  const rows = await graphGetAll(token, "/me/adaccounts", {
    fields: AD_ACCOUNT_FIELDS,
    limit: "100",
  });
  return rows as GraphAdAccount[];
}
