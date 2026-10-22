import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { briefReviewDue, runBriefReviewIfDue } from "../src/briefReview.ts";
import type { AutoChatBody } from "../src/wire.ts";

describe("briefReviewDue", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("is due the first time and after a week, not before", () => {
    expect(briefReviewDue(null, now)).toBe(true);
    expect(briefReviewDue("2026-10-15T12:00:00Z", now)).toBe(true);
    expect(briefReviewDue("2026-10-16T12:00:00Z", now)).toBe(false);
    expect(briefReviewDue("garbage", now)).toBe(true);
  });
});

describe("runBriefReviewIfDue", () => {
  it("starts the clock on a new machine, then opens one Manager chat a week", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "brief-review-")), "state", "brief-review.json");
    const chats: AutoChatBody[] = [];
    const api = { autoChat: async (b: AutoChatBody) => (chats.push(b), { chatId: "c1" }) };
    expect(await runBriefReviewIfDue({ api, file, now: new Date("2026-10-22T12:00:00Z") })).toBe(false);
    expect(await runBriefReviewIfDue({ api, file, now: new Date("2026-10-25T12:00:00Z") })).toBe(false);
    expect(await runBriefReviewIfDue({ api, file, now: new Date("2026-10-29T12:00:00Z") })).toBe(true);
    expect(await runBriefReviewIfDue({ api, file, now: new Date("2026-10-30T12:00:00Z") })).toBe(false);
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ tenantId: null, agent: "manager", title: "Weekly brief review" });
  });
});
