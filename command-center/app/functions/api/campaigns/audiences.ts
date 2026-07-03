import type { Env, ApiData } from "../../lib/env";
import {
  fetchAllContacts,
  fetchAllOpportunities,
  type GhlContactRecord,
  type GhlOpportunity,
  type GhlContext,
} from "../../lib/ghl";

// The client-facing Audiences surface: a read-only view of the customer
// segments we (the agency) can reach when we run a campaign on the client's
// behalf. Counts are derived live from the client's own GHL contacts +
// opportunity history, resolved with no client action required.
//
// Golden rule (same as Reactivation / the reviews funnel): a real client only
// ever sees their own numbers. An empty/unresolvable contact list returns
// { configError: "not_connected" } so the surface shows its honest empty state,
// never zeros-as-data. Results are cached in-memory per tenant for ~15 min
// (two upstream GHL calls per load), mirroring reviews/summary.ts.

export interface AudienceSegment {
  id: string;
  name: string;
  count: number;
  desc: string;
}

export interface AudiencesData {
  segments: AudienceSegment[];
  // Present when the contact list could not be resolved (nothing connected yet).
  configError?: "not_connected";
}

const NEW_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // first added within 60 days
const DORMANT_MS = 365 * 24 * 60 * 60 * 1000; // no activity in 12 months

function hasReachable(c: GhlContactRecord): boolean {
  return Boolean(c.phone?.trim() || c.email?.trim());
}

function ms(v?: string): number | undefined {
  if (!v) return undefined;
  const t = +new Date(v);
  return Number.isFinite(t) ? t : undefined;
}

// Pure roll-up of the four computable segments, exported so the math is
// unit-testable without a live GHL call. The two trade-specific demo segments
// ("Recent 5star jobs", "No A/C in 12mo") are intentionally omitted here: they
// need review/service-type data we do not reliably have. They stay in the demo
// payload only.
export function computeSegments(
  contacts: GhlContactRecord[],
  opportunities: GhlOpportunity[],
  nowMs: number,
): AudienceSegment[] {
  const reachable = contacts.filter(hasReachable);

  // Per-contact opportunity roll-ups: how many jobs they have won, and when they
  // were last active. Both drive the VIP and Past-customer segments.
  const wonByContact = new Map<string, number>();
  const latestByContact = new Map<string, number>();
  for (const o of opportunities) {
    const cid = o.contact?.id ?? o.contactId ?? "";
    if (!cid) continue;
    if ((o.status ?? "").toLowerCase() === "won") {
      wonByContact.set(cid, (wonByContact.get(cid) ?? 0) + 1);
    }
    const activity = ms(o.lastStatusChangeAt) ?? ms(o.updatedAt) ?? ms(o.createdAt);
    if (activity !== undefined) {
      const prev = latestByContact.get(cid);
      if (prev === undefined || activity > prev) latestByContact.set(cid, activity);
    }
  }

  let newCustomers = 0;
  let repeatVip = 0;
  let past = 0;
  for (const c of reachable) {
    const added = ms(c.dateAdded);
    if (added !== undefined && nowMs - added <= NEW_WINDOW_MS) newCustomers += 1;
    if ((wonByContact.get(c.id) ?? 0) >= 3) repeatVip += 1;
    const latest = latestByContact.get(c.id);
    if (latest !== undefined && nowMs - latest > DORMANT_MS) past += 1;
  }

  return [
    {
      id: "all",
      name: "All customers",
      count: reachable.length,
      desc: "Everyone in your customer list with a phone or email on file.",
    },
    {
      id: "past",
      name: "Past customers",
      count: past,
      desc: "No booked job in the last 12 months. Ripe for a win-back.",
    },
    {
      id: "vip",
      name: "Repeat / VIP",
      count: repeatVip,
      desc: "Booked 3+ jobs. Your most loyal customers.",
    },
    {
      id: "new",
      name: "New customers",
      count: newCustomers,
      desc: "First added in the last 60 days.",
    },
  ];
}

const NOT_CONNECTED: AudiencesData = { segments: [], configError: "not_connected" };

interface CacheEntry {
  data: AudiencesData;
  expiresAt: number;
}
const audiencesCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60_000;

// GET /api/campaigns/audiences: the client's customer segments with live counts.
// Degrades to not-connected on an empty contact list or any GHL error, so the
// surface never renders a fabricated audience.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const cacheKey = `${t.slug}:${t.ghl_location_id}`;
  const cached = audiencesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.data);
  }

  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  let data: AudiencesData;
  try {
    const [contacts, opportunities] = await Promise.all([
      fetchAllContacts(gctx),
      fetchAllOpportunities(gctx),
    ]);
    if (contacts.length === 0) return Response.json(NOT_CONNECTED);
    data = { segments: computeSegments(contacts, opportunities, Date.now()) };
  } catch {
    // A GHL outage should show not-connected, never crash the Audiences tab.
    return Response.json(NOT_CONNECTED);
  }

  audiencesCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return Response.json(data);
};
