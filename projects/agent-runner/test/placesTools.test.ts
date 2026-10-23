import { describe, expect, it } from "vitest";
import { placeReviews, searchPlaces } from "../src/placesTools.ts";

function google(answer: unknown, status = 200) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe("places", () => {
  it("searches the classic text search and lists rating, count and id", async () => {
    const { calls, f } = google({ status: "OK", results: [{ place_id: "ChIJabc1234567", name: "Glass Co", rating: 4.6, user_ratings_total: 88, formatted_address: "Ann Arbor, MI" }] });
    const out = await searchPlaces("windows Ann Arbor", { apiKey: "k", fetchImpl: f });
    expect(out).toBe("- Glass Co | 4.6 stars, 88 reviews | Ann Arbor, MI | id ChIJabc1234567");
    expect(calls[0]).toMatch(/^https:\/\/maps\.googleapis\.com\/maps\/api\/place\/textsearch\/json\?query=windows/);
  });

  it("reads reviews by id and refuses anything that is not an id", async () => {
    const { f } = google({ status: "OK", result: { name: "Glass Co", rating: 4.6, user_ratings_total: 88, reviews: [{ rating: 2, relative_time_description: "a month ago", text: "Took three weeks to   call back" }] } });
    expect(await placeReviews("ChIJabc1234567", { apiKey: "k", fetchImpl: f })).toContain("2 stars, a month ago: Took three weeks to call back");
    await expect(placeReviews("../../x", { apiKey: "k", fetchImpl: f })).rejects.toThrow(/id from a search/);
  });

  it("asks for the most relevant and the newest reviews and keeps each review once", async () => {
    const both = { rating: 1, author_name: "Ann", time: 1, relative_time_description: "a week ago", text: "Never showed" };
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      const newest = url.includes("reviews_sort=newest");
      const reviews = newest ? [both, { rating: 5, author_name: "Bo", time: 2, text: "Fast crew" }] : [both];
      return new Response(JSON.stringify({ status: "OK", result: { name: "Glass Co", rating: 4.6, user_ratings_total: 88, reviews } }));
    }) as unknown as typeof fetch;
    const out = await placeReviews("ChIJabc1234567", { apiKey: "k", fetchImpl: f });
    expect(calls.map((u) => new URL(u).searchParams.get("reviews_sort")).sort()).toEqual(["most_relevant", "newest"]);
    expect(out.match(/Never showed/g)).toHaveLength(1);
    expect(out).toContain("5 stars, : Fast crew");
  });

  it("reports Google's status and message, never the URL with the key in it", async () => {
    const { f } = google({ status: "REQUEST_DENIED", error_message: "This API project is not authorized" });
    const err = await searchPlaces("x", { apiKey: "secret-key", fetchImpl: f }).catch((e: Error) => e);
    expect((err as Error).message).toBe("Google Places REQUEST_DENIED: This API project is not authorized");
    expect((err as Error).message).not.toContain("secret-key");
  });

  it("treats no results as an answer, not an error", async () => {
    const { f } = google({ status: "ZERO_RESULTS", results: [] });
    expect(await searchPlaces("nothing here", { apiKey: "k", fetchImpl: f })).toBe("No businesses found.");
  });
});
