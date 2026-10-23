// Google Places for the Market Research Agent: find a business (the client
// or a competitor) and read its rating, review count and the reviews Google
// gives out (five at most per place, Google's own limit). The app already
// holds GOOGLE_PLACES_API_KEY; it reaches the runner with Doppler's prd
// secrets. The host is fixed, so nothing a model types can aim this elsewhere.

const BASE = "https://places.googleapis.com/v1";

export interface PlacesDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

type Obj = Record<string, any>;

async function call(d: PlacesDeps, path: string, init: RequestInit & { fields: string }): Promise<Obj> {
  const f = d.fetchImpl ?? fetch;
  const res = await f(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-goog-api-key": d.apiKey, "x-goog-fieldmask": init.fields },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as Obj;
  // Google's own message, never the key: the key rides in a header, not the URL.
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${body.error?.message ?? "no answer"}`);
  return body;
}

// Up to ten businesses for a search like "window replacement Ann Arbor MI".
export async function searchPlaces(query: string, d: PlacesDeps): Promise<string> {
  const q = query.trim();
  if (!q) throw new Error("query is required");
  const r = await call(d, "/places:searchText", {
    method: "POST",
    body: JSON.stringify({ textQuery: q, pageSize: 10 }),
    fields: "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri",
  });
  const rows = ((r.places ?? []) as Obj[]).map(
    (p) => `- ${p.displayName?.text ?? "?"} | ${p.rating ?? "no"} stars, ${p.userRatingCount ?? 0} reviews | ${p.formattedAddress ?? ""} | ${p.websiteUri ?? "no website"} | id ${p.id}`,
  );
  return rows.join("\n") || "No businesses found.";
}

// One business by the id searchPlaces gave: rating, count and its reviews.
export async function placeReviews(placeId: string, d: PlacesDeps): Promise<string> {
  const id = placeId.trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new Error("place_id must be an id from a search");
  const p = await call(d, `/places/${encodeURIComponent(id)}`, {
    method: "GET",
    fields: "displayName,rating,userRatingCount,reviews",
  });
  const reviews = ((p.reviews ?? []) as Obj[]).map(
    (r) => `- ${r.rating ?? "?"} stars, ${r.relativePublishTimeDescription ?? ""}: ${(r.text?.text ?? r.originalText?.text ?? "").replace(/\s+/g, " ").trim()}`,
  );
  return [`# ${p.displayName?.text ?? id}`, `${p.rating ?? "no"} stars from ${p.userRatingCount ?? 0} reviews (Google shows at most 5 below)`, ...reviews].join("\n");
}
