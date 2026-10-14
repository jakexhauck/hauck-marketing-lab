import { describe, it, expect } from "vitest";
import { INBOX_TABS, DEFAULT_INBOX_TAB, conversationsForTab } from "./inboxTabs";
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
  it("is a single Inbox tab", () => {
    expect(INBOX_TABS.map((t) => t.label)).toEqual(["Inbox"]);
  });
  it("defaults to the Inbox tab", () => {
    expect(DEFAULT_INBOX_TAB).toBe(INBOX_TABS[0].key);
  });
});

describe("conversationsForTab", () => {
  it("returns every conversation regardless of stage or source", () => {
    const items = [
      conv({ id: "a", stageName: "Hot Lead 🔥", origin: "chat" }),
      conv({ id: "b", stageName: "Job Booked 💼", origin: "form" }),
      conv({ id: "c", stageName: "No Answer 🤷", origin: "form" }),
    ];
    expect(
      conversationsForTab(items, DEFAULT_INBOX_TAB, "").map((c) => c.id).sort(),
    ).toEqual(["a", "b", "c"]);
  });
  // The feed carries the client's review-request chats too, because Reviews >
  // Chats reads the same query. They belong on that page, not in here.
  it("drops a conversation the server flagged as not Inbox", () => {
    const items = [
      conv({ id: "handed-off", inbox: true }),
      conv({ id: "review-request", inbox: false }),
    ];
    expect(
      conversationsForTab(items, DEFAULT_INBOX_TAB, "").map((c) => c.id),
    ).toEqual(["handed-off"]);
  });
  // Demo data and any payload cached by a bundle older than the flag carry no
  // `inbox` field. Those must stay visible: an absent flag is not a "no".
  it("keeps a conversation with no inbox flag at all", () => {
    const items = [conv({ id: "legacy" })];
    expect(
      conversationsForTab(items, DEFAULT_INBOX_TAB, "").map((c) => c.id),
    ).toEqual(["legacy"]);
  });
  it("applies the search filter on name and preview", () => {
    const items = [
      conv({ id: "a", name: "Alice", preview: "roof" }),
      conv({ id: "b", name: "Bob", preview: "window quote" }),
    ];
    expect(
      conversationsForTab(items, DEFAULT_INBOX_TAB, "window").map((c) => c.id),
    ).toEqual(["b"]);
  });
  it("sorts unread to the top, longest-wait-first", () => {
    const items = [
      conv({ id: "read", unreadCount: 0, lastMessageAt: "2026-07-06T10:00:00Z" }),
      conv({ id: "newer-unread", unreadCount: 1, lastMessageAt: "2026-07-06T09:00:00Z" }),
      conv({ id: "older-unread", unreadCount: 2, lastMessageAt: "2026-07-06T08:00:00Z" }),
    ];
    expect(
      conversationsForTab(items, DEFAULT_INBOX_TAB, "").map((c) => c.id),
    ).toEqual(["older-unread", "newer-unread", "read"]);
  });
});
