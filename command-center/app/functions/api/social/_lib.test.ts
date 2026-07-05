import { describe, expect, it } from "vitest";
import { normalizePlatform, normalizeStatus, shapeSocialPost } from "./_lib";
import type { SocialPlatform } from "./_lib";

describe("normalizePlatform", () => {
  it("maps GHL platform strings onto fb/ig/gb", () => {
    expect(normalizePlatform("facebook")).toBe("fb");
    expect(normalizePlatform("instagram")).toBe("ig");
    expect(normalizePlatform("google")).toBe("gb");
    expect(normalizePlatform("googleMyBusiness")).toBe("gb");
    expect(normalizePlatform("gmb")).toBe("gb");
  });
  it("drops platforms we do not render", () => {
    expect(normalizePlatform("tiktok")).toBeNull();
    expect(normalizePlatform("linkedin")).toBeNull();
    expect(normalizePlatform("")).toBeNull();
    expect(normalizePlatform(undefined)).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("folds GHL's wider enum onto our four buckets", () => {
    expect(normalizeStatus("published")).toBe("posted");
    expect(normalizeStatus("completed")).toBe("posted");
    expect(normalizeStatus("draft")).toBe("draft");
    expect(normalizeStatus("failed")).toBe("failed");
    expect(normalizeStatus("in_review")).toBe("scheduled");
    expect(normalizeStatus("pending")).toBe("scheduled");
    expect(normalizeStatus(undefined)).toBe("scheduled");
  });
});

describe("shapeSocialPost", () => {
  const map = new Map<string, SocialPlatform>([
    ["acc-fb", "fb"],
    ["acc-ig", "ig"],
  ]);

  it("resolves platforms by joining accountIds against the account map", () => {
    const post = shapeSocialPost(
      { _id: "p1", summary: "hi", status: "scheduled", accountIds: ["acc-fb", "acc-ig"], scheduleDate: "2026-07-11T18:00:00Z" },
      map,
    );
    expect(post).not.toBeNull();
    expect(post!.id).toBe("p1");
    expect(new Set(post!.platforms)).toEqual(new Set(["fb", "ig"]));
    expect(post!.scheduleAt).toBe("2026-07-11T18:00:00Z");
  });

  it("drops a post with no id", () => {
    expect(shapeSocialPost({ summary: "no id" }, map)).toBeNull();
  });

  it("reads media from either media[].url or mediaUrls[]", () => {
    const a = shapeSocialPost({ id: "a", media: [{ url: "u1" }, "u2"] }, map);
    const b = shapeSocialPost({ id: "b", mediaUrls: ["u3"] }, map);
    expect(a!.mediaUrls).toEqual(["u1", "u2"]);
    expect(b!.mediaUrls).toEqual(["u3"]);
  });

  it("sets publishedAt only for posted status", () => {
    const posted = shapeSocialPost({ id: "p", status: "published", publishedAt: "2026-06-14T15:00:00Z" }, map);
    expect(posted!.status).toBe("posted");
    expect(posted!.publishedAt).toBe("2026-06-14T15:00:00Z");
  });
});
