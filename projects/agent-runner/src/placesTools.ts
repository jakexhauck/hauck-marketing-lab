// Google Places for the Market Research Agent: find a business (the client
// or a competitor) and read its rating, review count and the reviews Google
// gives out (five at most per place, Google's own limit). The app already
// holds GOOGLE_PLACES_API_KEY; it reaches the runner with Doppler's prd
// secrets. The host is fixed, so nothing a model types can aim this elsewhere.
//
// The classic Places web service, the one the app's own lookups use: the key
// is enabled for it and not for Places API (New) (a live check, 2026-10-22,
// got a 403 from the new one). The classic API takes the key in the URL, so
// no error here ever includes the URL.

const BASE = "https://maps.googleapis.com/maps/api/place";

export interface PlacesDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

type Obj = Record<string, any>;

async function call(d: PlacesDeps, path: string, params: Record<string, string>): Promise<Obj> {
  const f = d.fetchImpl ?? fetch;
  const qs = new URLSearchParams({ ...params, key: d.apiKey });
  const res = await f(`${BASE}/${path}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as Obj;
  // The classic API answers 200 with a status of its own.
  if (!res.ok || (body.status && body.status !== "OK" && body.status !== "ZERO_RESULTS")) {
    throw new Error(`Google Places ${body.status ?? res.status}: ${body.error_message ?? "no answer"}`);
  }
  return body;
}

// Up to ten businesses for a search like "window replacement Ann Arbor MI".
export async function searchPlaces(query: string, d: PlacesDeps): Promise<string> {
  const q = query.trim();
  if (!q) throw new Error("query is required");
  const r = await call(d, "textsearch/json", { query: q });
  const rows = ((r.results ?? []) as Obj[])
    .slice(0, 10)
    .map((p) => `- ${p.name ?? "?"} | ${p.rating ?? "no"} stars, ${p.user_ratings_total ?? 0} reviews | ${p.formatted_address ?? ""} | id ${p.place_id}`);
  return rows.join("\n") || "No businesses found.";
}

// One business by the id searchPlaces gave: rating, count, website and reviews.
export async function placeReviews(placeId: string, d: PlacesDeps): Promise<string> {
  const id = placeId.trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new Error("place_id must be an id from a search");
  const r = await call(d, "details/json", { place_id: id, fields: "name,rating,user_ratings_total,website,reviews", reviews_sort: "newest" });
  const p = (r.result ?? {}) as Obj;
  const reviews = ((p.reviews ?? []) as Obj[]).map(
    (v) => `- ${v.rating ?? "?"} stars, ${v.relative_time_description ?? ""}: ${String(v.text ?? "").replace(/\s+/g, " ").trim()}`,
  );
  return [
    `# ${p.name ?? id}`,
    `${p.rating ?? "no"} stars from ${p.user_ratings_total ?? 0} reviews (Google shows at most 5 below)${p.website ? ` | ${p.website}` : ""}`,
    ...reviews,
  ].join("\n");
}
