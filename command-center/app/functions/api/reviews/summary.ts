import type { Env, ApiData } from "../../lib/env";

// The client-facing Google rating hero + recent-reviews teaser on the Reviews
// Overview. Reads the business's public rating from the Google Places API (Place
// Details), which needs only an API key, no OAuth and no access-approval gate.
// This is the fast half of the reviews build; the full review history + replies
// come from the Business Profile API v4 later (see
// docs/build-plans/reviews-google-integration.md).
//
// Golden rule (same as Paid Ads / the reviews funnel): a real client only ever
// sees their real numbers. When the Places key or the tenant's place_id is
// missing, or Google returns no usable result, the endpoint returns
// { configError: "not_connected" } and the hero shows its honest not-connected
// state. Never a fabricated rating.
//
// The Places API is billed per call, so results are cached in-memory per
// place_id for ~15 min, mirroring customFieldsCache in functions/lib/ghl.ts.

const PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";

export interface ReviewSummaryItem {
  // Stable id for React keys: Places gives no review id, so we hash author+time.
  id: string;
  author: string;
  initials: string;
  rating: number;
  body: string;
  // Google's own relative label ("2 weeks ago"), shown as-is.
  when: string;
}

export interface ReviewSummaryData {
  // Overall Google rating (0 when unrated), and total public review count.
  average: number;
  total: number;
  // Up to 5 most-relevant reviews Google returns for the place.
  recent: ReviewSummaryItem[];
  // Present when the place cannot be resolved (no key / no place_id / Places
  // returned no result). The surface then shows its not-connected state.
  configError?: "not_connected";
}

interface PlacesReview {
  author_name?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
  time?: number;
}

interface PlacesDetailsResponse {
  status?: string;
  result?: {
    rating?: number;
    user_ratings_total?: number;
    reviews?: PlacesReview[];
  };
  error_message?: string;
}

interface CacheEntry {
  data: ReviewSummaryData;
  expiresAt: number;
}
const summaryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60_000;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const NOT_CONNECTED: ReviewSummaryData = {
  average: 0,
  total: 0,
  recent: [],
  configError: "not_connected",
};

// Shape a Places Details payload into the client summary. Exported so the
// normalization is unit-testable without a live Places call.
export function shapePlacesSummary(
  res: PlacesDetailsResponse,
): ReviewSummaryData {
  if (res.status !== "OK" || !res.result) return NOT_CONNECTED;
  const r = res.result;
  const recent: ReviewSummaryItem[] = (r.reviews ?? [])
    .filter((rv) => typeof rv.rating === "number")
    .slice(0, 5)
    .map((rv, i) => {
      const author = (rv.author_name ?? "").trim() || "Google user";
      return {
        id: `${rv.time ?? i}-${author}`,
        author,
        initials: initialsOf(author),
        rating: Math.round(rv.rating ?? 0),
        body: (rv.text ?? "").trim(),
        when: rv.relative_time_description ?? "",
      };
    });
  return {
    average: typeof r.rating === "number" ? r.rating : 0,
    total: typeof r.user_ratings_total === "number" ? r.user_ratings_total : 0,
    recent,
  };
}

// GET /api/reviews/summary: the place's Google rating, review count, and up to
// five recent reviews. Degrades to not-connected on any missing config or a
// non-OK Places status, so the hero never renders a fabricated number.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const placeId = ctx.data.tenant.google_place_id?.trim();
  const key = ctx.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!placeId || !key) return Response.json(NOT_CONNECTED);

  const cached = summaryCache.get(placeId);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.data);
  }

  const url = new URL(PLACES_DETAILS);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "rating,user_ratings_total,reviews");
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("key", key);

  let data: ReviewSummaryData;
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return Response.json(NOT_CONNECTED);
    const body = (await res.json()) as PlacesDetailsResponse;
    data = shapePlacesSummary(body);
  } catch {
    // A Places outage should show not-connected, never crash the Overview.
    return Response.json(NOT_CONNECTED);
  }

  // Only cache a real, connected result; keep retrying while not-connected.
  if (!data.configError) {
    summaryCache.set(placeId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return Response.json(data);
};
