import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  postsByBucket,
  socialKpis,
  upNextPosts,
  recentPosts,
  postTitle,
  type SocialPost,
} from "./social";

function post(over: Partial<SocialPost> & { id: string }): SocialPost {
  return {
    summary: "A post",
    status: "scheduled",
    scheduleAt: null,
    publishedAt: null,
    platforms: ["fb"],
    mediaUrls: [],
    ...over,
  };
}

// Build an ISO string from local date parts so day placement is TZ-stable.
function localIso(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m, d, h, 0, 0).toISOString();
}

describe("postTitle", () => {
  it("uses the first non-empty line and truncates", () => {
    expect(postTitle(post({ id: "a", summary: "\nHello there\nmore" }))).toBe("Hello there");
    expect(postTitle(post({ id: "b", summary: "" }))).toBe("Untitled post");
    expect(postTitle(post({ id: "c", summary: "x".repeat(100) })).endsWith("…")).toBe(true);
  });
});

describe("postsByBucket", () => {
  it("splits by status and files failed under scheduled", () => {
    const posts = [
      post({ id: "s", status: "scheduled", scheduleAt: localIso(2026, 6, 10) }),
      post({ id: "d", status: "draft" }),
      post({ id: "p", status: "posted", publishedAt: localIso(2026, 6, 1) }),
      post({ id: "f", status: "failed", scheduleAt: localIso(2026, 6, 5) }),
    ];
    const b = postsByBucket(posts);
    expect(b.scheduled.map((p) => p.id)).toEqual(["f", "s"]); // soonest first
    expect(b.drafts.map((p) => p.id)).toEqual(["d"]);
    expect(b.posted.map((p) => p.id)).toEqual(["p"]);
  });
});

describe("socialKpis", () => {
  it("counts posted-this-month and scheduled", () => {
    const now = new Date(2026, 6, 20).getTime(); // July 2026 local
    const posts = [
      post({ id: "1", status: "posted", publishedAt: localIso(2026, 6, 3) }),
      post({ id: "2", status: "posted", publishedAt: localIso(2026, 5, 3) }), // June, not counted
      post({ id: "3", status: "scheduled", scheduleAt: localIso(2026, 6, 25) }),
      post({ id: "4", status: "scheduled", scheduleAt: localIso(2026, 7, 2) }),
    ];
    const k = socialKpis(posts, now);
    expect(k.postsThisMonth).toBe(1);
    expect(k.scheduled).toBe(2);
  });
});

describe("upNextPosts / recentPosts", () => {
  it("orders scheduled soonest-first and posted newest-first", () => {
    const posts = [
      post({ id: "later", status: "scheduled", scheduleAt: localIso(2026, 6, 20) }),
      post({ id: "sooner", status: "scheduled", scheduleAt: localIso(2026, 6, 10) }),
      post({ id: "old", status: "posted", publishedAt: localIso(2026, 5, 1) }),
      post({ id: "new", status: "posted", publishedAt: localIso(2026, 5, 15) }),
    ];
    expect(upNextPosts(posts, 5).map((p) => p.id)).toEqual(["sooner", "later"]);
    expect(recentPosts(posts, 5).map((p) => p.id)).toEqual(["new", "old"]);
  });
});

describe("buildMonthGrid", () => {
  it("returns full weeks with the in-month days and drops posts on their date", () => {
    const now = new Date(2026, 6, 15).getTime();
    const posts = [post({ id: "e", status: "scheduled", scheduleAt: localIso(2026, 6, 15) })];
    const cells = buildMonthGrid(2026, 6, posts, now); // July 2026

    expect(cells.length % 7).toBe(0);
    const inMonth = cells.filter((c) => !c.out);
    expect(inMonth.length).toBe(31); // July has 31 days
    const day15 = inMonth.find((c) => c.day === 15);
    expect(day15?.today).toBe(true);
    expect(day15?.events?.[0]?.id).toBe("e");
  });
});
