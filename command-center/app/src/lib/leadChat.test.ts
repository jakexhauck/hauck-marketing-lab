import { describe, it, expect } from "vitest";
import { buildUnreadIndex, leadUnreadCount } from "./leadChat";
import type { ApiConversation } from "./api";

function conv(p: Partial<ApiConversation>): ApiConversation {
  return {
    id: "c",
    contactId: "k1",
    name: "Lead",
    preview: "",
    lastMessageType: "SMS",
    lastMessageAt: "2026-07-06T10:00:00Z",
    unreadCount: 0,
    ...p,
  };
}

describe("buildUnreadIndex", () => {
  it("keys conversations by contactId with unread info", () => {
    const idx = buildUnreadIndex([
      conv({ contactId: "a", unreadCount: 2, lastMessageAt: "T1", channel: "sms" }),
      conv({ contactId: "b", unreadCount: 0, lastMessageAt: "T2" }),
    ]);
    expect(idx.get("a")).toEqual({ unreadCount: 2, lastMessageAt: "T1", channel: "sms" });
    expect(idx.get("b")?.unreadCount).toBe(0);
  });

  it("defaults channel to 'other' when absent", () => {
    const idx = buildUnreadIndex([conv({ contactId: "a", unreadCount: 1 })]);
    expect(idx.get("a")?.channel).toBe("other");
  });
});

describe("leadUnreadCount", () => {
  const idx = buildUnreadIndex([
    conv({ contactId: "a", unreadCount: 3, lastMessageAt: "T1" }),
  ]);

  it("returns the unread count for an unseen inbound", () => {
    expect(leadUnreadCount(idx, "a", {})).toBe(3);
  });

  it("returns 0 once the latest message has been seen", () => {
    expect(leadUnreadCount(idx, "a", { a: "T1" })).toBe(0);
  });

  it("re-lights when a newer inbound arrives after being seen", () => {
    expect(leadUnreadCount(idx, "a", { a: "T0-older" })).toBe(3);
  });

  it("returns 0 for a missing contactId or no conversation", () => {
    expect(leadUnreadCount(idx, null, {})).toBe(0);
    expect(leadUnreadCount(idx, "zzz", {})).toBe(0);
  });

  it("returns 0 when the conversation has no unread", () => {
    const zero = buildUnreadIndex([conv({ contactId: "a", unreadCount: 0, lastMessageAt: "T1" })]);
    expect(leadUnreadCount(zero, "a", {})).toBe(0);
  });
});
