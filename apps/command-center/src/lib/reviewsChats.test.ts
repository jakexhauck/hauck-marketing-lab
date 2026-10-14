import { describe, it, expect } from "vitest";
import {
  REVIEWS_CHAT_TABS,
  DEFAULT_REVIEWS_CHAT_TAB,
  reviewsStageName,
  isReviewConversation,
  conversationsForReviewsTab,
} from "./reviewsChats";
import type { ApiConversation } from "./api";

const pipe = (pipelineName: string, stageName: string) => ({
  pipelineId: pipelineName,
  pipelineStageId: stageName,
  pipelineName,
  stageName,
  status: "open",
});

const conv = (over: Partial<ApiConversation>): ApiConversation => ({
  id: "c",
  contactId: "ct",
  name: "N",
  preview: "p",
  lastMessageType: "TYPE_SMS",
  lastMessageAt: "2026-07-16T00:00:00Z",
  unreadCount: 0,
  channel: "sms",
  origin: "other",
  source: "",
  firstTouchAt: "",
  ...over,
});

describe("REVIEWS_CHAT_TABS", () => {
  it("mirrors the live Google Reviews pipeline, in order", () => {
    expect(REVIEWS_CHAT_TABS.map((t) => t.label)).toEqual([
      "Asked",
      "Clicked",
      "Negative",
      "Positive",
    ]);
    // The short labels must still match the real live stage names.
    expect(REVIEWS_CHAT_TABS.map((t) => t.match)).toEqual([
      "asked for review",
      "review link clicked",
      "negative feedback",
      "positive review",
    ]);
    expect(DEFAULT_REVIEWS_CHAT_TAB).toBe(REVIEWS_CHAT_TABS[0].key);
  });
});

describe("reviewsStageName", () => {
  it("reads the Google Reviews position even when Sales was the chosen one", () => {
    const c = conv({
      stageName: "Job Completed ✅",
      pipelineName: "Sales",
      pipelines: [
        pipe("Sales", "Job Completed ✅"),
        pipe("Google Reviews", "Asked For Review"),
      ],
    });
    expect(reviewsStageName(c)).toBe("Asked For Review");
    expect(isReviewConversation(c)).toBe(true);
  });
  it("ignores a contact who is only in Sales", () => {
    const c = conv({ pipelines: [pipe("Sales", "Hot Lead 🔥")] });
    expect(reviewsStageName(c)).toBeUndefined();
    expect(isReviewConversation(c)).toBe(false);
  });
  it("ignores payloads cached before `pipelines` shipped rather than throwing", () => {
    expect(isReviewConversation(conv({ stageName: "Asked For Review" }))).toBe(
      false,
    );
  });
  // A rename must not silently empty the page: the honest "no review requests
  // yet" state would look identical to the page working.
  it("survives the pipeline being renamed or given an emoji", () => {
    const renamed = conv({
      pipelines: [pipe("Google Reviews 2026 ⭐", "Review Link Clicked")],
    });
    expect(reviewsStageName(renamed)).toBe("Review Link Clicked");
    const loose = conv({ pipelines: [pipe("Reviews", "Asked For Review")] });
    expect(reviewsStageName(loose)).toBe("Asked For Review");
  });
  it("falls back to the live pipeline id when the name is unrecognisable", () => {
    const c = conv({
      pipelines: [
        {
          pipelineId: "R76ncRGrODiJuDJJTUWR",
          pipelineStageId: "s",
          pipelineName: "Reputation Engine",
          stageName: "Positive Review Submission",
          status: "open",
        },
      ],
    });
    expect(reviewsStageName(c)).toBe("Positive Review Submission");
  });
  it("still ignores a Sales-only contact under the loose matching", () => {
    expect(
      reviewsStageName(conv({ pipelines: [pipe("Sales", "Job Completed ✅")] })),
    ).toBeUndefined();
  });
});

describe("conversationsForReviewsTab", () => {
  it("slices by Google Reviews stage, not by the chosen opportunity", () => {
    const items = [
      conv({
        id: "asked",
        pipelines: [pipe("Sales", "Job Completed ✅"), pipe("Google Reviews", "Asked For Review")],
      }),
      conv({
        id: "clicked",
        pipelines: [pipe("Google Reviews", "Review Link Clicked")],
      }),
      conv({ id: "sales-only", pipelines: [pipe("Sales", "Hot Lead 🔥")] }),
    ];
    expect(
      conversationsForReviewsTab(items, "asked", "").map((c) => c.id),
    ).toEqual(["asked"]);
    expect(
      conversationsForReviewsTab(items, "clicked", "").map((c) => c.id),
    ).toEqual(["clicked"]);
  });
  it("tolerates an emoji suffix on a live stage name", () => {
    const items = [
      conv({ id: "n", pipelines: [pipe("Google Reviews", "Negative Feedback Received 😠")] }),
    ];
    expect(
      conversationsForReviewsTab(items, "negative", "").map((c) => c.id),
    ).toEqual(["n"]);
  });
  it("applies the search filter on name and preview", () => {
    const items = [
      conv({ id: "a", name: "Alice", preview: "thanks", pipelines: [pipe("Google Reviews", "Asked For Review")] }),
      conv({ id: "b", name: "Bob", preview: "five stars", pipelines: [pipe("Google Reviews", "Asked For Review")] }),
    ];
    expect(
      conversationsForReviewsTab(items, "asked", "stars").map((c) => c.id),
    ).toEqual(["b"]);
  });
  it("sorts unread to the top, longest-wait-first", () => {
    const p = [pipe("Google Reviews", "Asked For Review")];
    const items = [
      conv({ id: "read", unreadCount: 0, lastMessageAt: "2026-07-16T10:00:00Z", pipelines: p }),
      conv({ id: "newer-unread", unreadCount: 1, lastMessageAt: "2026-07-16T09:00:00Z", pipelines: p }),
      conv({ id: "older-unread", unreadCount: 2, lastMessageAt: "2026-07-16T08:00:00Z", pipelines: p }),
    ];
    expect(conversationsForReviewsTab(items, "asked", "").map((c) => c.id)).toEqual([
      "older-unread",
      "newer-unread",
      "read",
    ]);
  });
});
