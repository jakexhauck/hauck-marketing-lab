import { describe, it, expect } from "vitest";
import {
  INBOX_TABS,
  DEFAULT_INBOX_TAB,
  countByTab,
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

describe("INBOX_TABS", () => {
  it("is the nine-tab strip in order: seven stages then two sources", () => {
    expect(INBOX_TABS.map((t) => t.label)).toEqual([
      "New Leads",
      "Hot Lead",
      "Phone Appt",
      "Estimate Scheduled",
      "Job Booked",
      "Job Completed",
      "Closed",
      "Chat Widget",
      "Estimate Form",
    ]);
  });
  it("defaults to New Leads (leftmost)", () => {
    expect(DEFAULT_INBOX_TAB).toBe(INBOX_TABS[0].key);
    expect(INBOX_TABS[0].label).toBe("New Leads");
  });
});

describe("countByTab", () => {
  it("counts every conversation into its stage tab", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥", origin: "chat" }),
      conv({ id: "b", stageName: "Job Booked 💼", origin: "form" }),
      conv({ id: "c", stageName: undefined, origin: "chat" }),
    ];
    const counts = countByTab(items);
    expect(counts["stage:new"]).toBe(1); // c
    expect(counts["stage:hot_lead"]).toBe(1); // a
    expect(counts["stage:job_booked"]).toBe(1); // b
  });
  it("counts source tabs across every stage (overlaps stage counts)", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥", origin: "chat" }),
      conv({ id: "c", stageName: undefined, origin: "chat" }),
      conv({ id: "b", stageName: "Job Booked 💼", origin: "form" }),
    ];
    const counts = countByTab(items);
    expect(counts["source:chat"]).toBe(2); // a + c, different stages
    expect(counts["source:form"]).toBe(1); // b
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
