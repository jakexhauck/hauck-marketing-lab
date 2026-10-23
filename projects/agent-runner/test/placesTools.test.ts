import { describe, expect, it } from "vitest";
import { placeReviews, searchPlaces } from "../src/placesTools.ts";

function google(answer: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe("places", () => {
  it("searches with the key in a header, never the URL", async () => {
    const { calls, f } = google({ places: [{ id: "ChIJabc1234567", displayName: { text: "Glass Co" }, rating: 4.6, userRatingCount: 88, formattedAddress: "Ann Arbor, MI" }] });
    const out = await searchPlaces("windows Ann Arbor", { apiKey: "secret-key", fetchImpl: f });
    expect(out).toContain("Glass Co | 4.6 stars, 88 reviews");
    expect(out).toContain("id ChIJabc1234567");
    expect(calls[0].url).not.toContain("secret-key");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });
  it("reads reviews by id and refuses anything that is not an id", async () => {
    const { f } = google({ displayName: { text: "Glass Co" }, rating: 4.6, userRatingCount: 88, reviews: [{ rating: 2, relativePublishTimeDescription: "a month ago", text: { text: "Took three weeks to   call back" } }] });
    expect(await placeReviews("ChIJabc1234567", { apiKey: "k", fetchImpl: f })).toContain("2 stars, a month ago: Took three weeks to call back");
    await expect(placeReviews("../../x", { apiKey: "k", fetchImpl: f })).rejects.toThrow(/id from a search/);
  });
  it("reports Google's message on an error", async () => {
    const { f } = google({ error: { message: "API key not valid" } }, 400);
    await expect(searchPlaces("x", { apiKey: "k", fetchImpl: f })).rejects.toThrow("Google Places 400: API key not valid");
  });
});
