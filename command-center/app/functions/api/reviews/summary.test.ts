import { describe, expect, it } from "vitest";
import { shapePlacesSummary } from "./summary";

describe("shapePlacesSummary", () => {
  it("normalizes a live Places Details payload", () => {
    const out = shapePlacesSummary({
      status: "OK",
      result: {
        rating: 4.8,
        user_ratings_total: 132,
        reviews: [
          {
            author_name: "The Garcias",
            rating: 5,
            text: "New heater in by lunch.",
            relative_time_description: "2 days ago",
            time: 1719000000,
          },
          {
            author_name: "Mark T.",
            rating: 4,
            text: "Honest AC tune-up.",
            relative_time_description: "a week ago",
            time: 1718000000,
          },
        ],
      },
    });
    expect(out.average).toBe(4.8);
    expect(out.total).toBe(132);
    expect(out.recent).toHaveLength(2);
    expect(out.recent[0]).toMatchObject({
      author: "The Garcias",
      initials: "TG",
      rating: 5,
      when: "2 days ago",
    });
    expect(out.configError).toBeUndefined();
  });

  it("caps recent reviews at five", () => {
    const reviews = Array.from({ length: 8 }, (_, i) => ({
      author_name: `Person ${i}`,
      rating: 5,
      text: `Review ${i}`,
      time: i,
    }));
    const out = shapePlacesSummary({
      status: "OK",
      result: { rating: 5, user_ratings_total: 8, reviews },
    });
    expect(out.recent).toHaveLength(5);
  });

  it("rounds fractional review ratings to whole stars", () => {
    const out = shapePlacesSummary({
      status: "OK",
      result: {
        rating: 4.5,
        user_ratings_total: 2,
        reviews: [{ author_name: "A B", rating: 3.5, text: "ok", time: 1 }],
      },
    });
    expect(out.recent[0].rating).toBe(4);
  });

  it("treats a missing name as a Google user with a safe initial", () => {
    const out = shapePlacesSummary({
      status: "OK",
      result: {
        rating: 5,
        user_ratings_total: 1,
        reviews: [{ rating: 5, text: "great", time: 1 }],
      },
    });
    expect(out.recent[0].author).toBe("Google user");
    expect(out.recent[0].initials).toBe("GU");
  });

  it("returns not-connected on a non-OK status", () => {
    const out = shapePlacesSummary({ status: "ZERO_RESULTS" });
    expect(out.configError).toBe("not_connected");
    expect(out.average).toBe(0);
    expect(out.total).toBe(0);
    expect(out.recent).toEqual([]);
  });

  it("handles a place with a rating but no reviews array", () => {
    const out = shapePlacesSummary({
      status: "OK",
      result: { rating: 4.2, user_ratings_total: 10 },
    });
    expect(out.average).toBe(4.2);
    expect(out.total).toBe(10);
    expect(out.recent).toEqual([]);
    expect(out.configError).toBeUndefined();
  });
});
