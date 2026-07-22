import { describe, it, expect } from "vitest";
import {
  INBOX_TABS,
  DEFAULT_INBOX_TAB,
  salesStageName,
  conversationsForTab,
} from "./inboxTabs";
import type { ApiConversation } from "./api";

const conv = (over: Partial<ApiConversation>): ApiConversation => ({
  id: "c",
  contactId: "ct",
  name: "N",
  preview: "p",
  lastMessageType: "TYPE_SMS",
  lastMessageAt: "2026-07-06T00:00:00Z",
  unreadCount: 0,
  channel: "sms",
  origin: "form",
  source: "",
  firstTouchAt: "",
  ...over,
});

const pipe = (pipelineName: string, stageName: string) => ({
  pipelineId: pipelineName,
  pipelineStageId: stageName,
  pipelineName,
  stageName,
  status: "open",
});

describe("INBOX_TABS", () => {
  it("is the ten-tab strip in order: eight Sales stages then two sources", () => {
    expect(INBOX_TABS.map((t) => t.label)).toEqual([
      "New Leads",
      "Hot Lead",
      "Phone Appt",
      "Estimate",
      "Job Booked",
      "Job Completed",
      "Nurture",
      "Chat Widget",
      "Estimate Form",
    ]);
  });
  it("defaults to New Leads (leftmost)", () => {
    expect(DEFAULT_INBOX_TAB).toBe(INBOX_TABS[0].key);
    expect(INBOX_TABS[0].label).toBe("New Leads");
  });
  it("has no Closed tab: Trash / Reactivation / Google Reviews are not Sales", () => {
    expect(INBOX_TABS.map((t) => t.key)).not.toContain("stage:closed");
  });
});

describe("salesStageName", () => {
  it("reads the Sales position, not whichever opportunity the backend chose", () => {
    // A past customer with a review request out: the backend's single chosen
    // opportunity is the Google Reviews one, but the Inbox is the Sales queue.
    const c = conv({
      stageName: "Asked For Review",
      pipelineName: "Google Reviews",
      pipelines: [
        pipe("Google Reviews", "Asked For Review"),
        pipe("Sales", "Job Completed ✅"),
      ],
    });
    expect(salesStageName(c)).toBe("Job Completed ✅");
  });
  it("falls back to the chosen stage when the contact has no Sales opportunity", () => {
    const c = conv({
      stageName: "No Answer 🤷",
      pipelines: [pipe("Trash", "No Answer 🤷")],
    });
    expect(salesStageName(c)).toBe("No Answer 🤷");
  });
  it("falls back for payloads cached before `pipelines` shipped", () => {
    expect(salesStageName(conv({ stageName: "Hot Lead 🔥" }))).toBe("Hot Lead 🔥");
  });
});

describe("two-pipeline contacts", () => {
  it("keeps a review-requested customer in Job Completed, not out of the Inbox", () => {
    const items = [
      conv({
        id: "past-customer",
        stageName: "Asked For Review",
        pipelines: [
          pipe("Google Reviews", "Asked For Review"),
          pipe("Sales", "Job Completed ✅"),
        ],
      }),
    ];
    expect(
      conversationsForTab(items, "stage:job_completed", "").map((c) => c.id),
    ).toEqual(["past-customer"]);
  });
  it("surfaces the live Long Term Nurture stage, which used to have no tab", () => {
    const items = [
      conv({ id: "n", stageName: "Long Term Nurture 🌱" }),
    ];
    expect(
      conversationsForTab(items, "stage:long_term_nurture", "").map((c) => c.id),
    ).toEqual(["n"]);
  });
});

describe("conversationsForTab", () => {
  it("returns only the active stage's conversations", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥" }),
      conv({ id: "b", stageName: "Job Booked 💼" }),
    ];
    expect(
      conversationsForTab(items, "stage:hot_lead", "").map((c) => c.id),
    ).toEqual(["a"]);
  });
  it("source tab slices by origin regardless of stage", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥", origin: "chat" }),
      conv({ id: "b", stageName: "Job Booked 💼", origin: "chat" }),
      conv({ id: "c", stageName: "Hot Lead 🔥", origin: "form" }),
    ];
    expect(
      conversationsForTab(items, "source:chat", "").map((c) => c.id).sort(),
    ).toEqual(["a", "b"]);
  });
  it("applies the search filter on name and preview", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥", name: "Alice", preview: "roof" }),
      conv({ id: "b", stageName: "Hot Lead 🔥", name: "Bob", preview: "window quote" }),
    ];
    expect(
      conversationsForTab(items, "stage:hot_lead", "window").map((c) => c.id),
    ).toEqual(["b"]);
  });
  it("sorts unread to the top, longest-wait-first", () => {
    const items = [
      conv({ id: "read", stageName: "Hot Lead 🔥", unreadCount: 0, lastMessageAt: "2026-07-06T10:00:00Z" }),
      conv({ id: "newer-unread", stageName: "Hot Lead 🔥", unreadCount: 1, lastMessageAt: "2026-07-06T09:00:00Z" }),
      conv({ id: "older-unread", stageName: "Hot Lead 🔥", unreadCount: 2, lastMessageAt: "2026-07-06T08:00:00Z" }),
    ];
    expect(
      conversationsForTab(items, "stage:hot_lead", "").map((c) => c.id),
    ).toEqual(["older-unread", "newer-unread", "read"]);
  });
});
