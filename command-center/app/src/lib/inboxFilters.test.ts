import { describe, expect, it } from "vitest";
import {
  channelFromType,
  convOrigin,
  filterConversations,
  countByChannel,
} from "./inboxFilters";
import type { ApiConversation } from "./api";

function conv(p: Partial<ApiConversation>): ApiConversation {
  return {
    id: "c",
    contactId: "x",
    name: "Jane Doe",
    preview: "hi",
    lastMessageType: "TYPE_SMS",
    lastMessageAt: "",
    unreadCount: 0,
    ...p,
  };
}

describe("channelFromType", () => {
  it("derives a channel when the field is missing", () => {
    expect(channelFromType("TYPE_SMS")).toBe("sms");
    expect(channelFromType("Email")).toBe("email");
  });
});

describe("convOrigin", () => {
  it("uses the server field, defaults to other", () => {
    expect(convOrigin(conv({ origin: "form" }))).toBe("form");
    expect(convOrigin(conv({ origin: undefined }))).toBe("other");
  });
});

describe("filterConversations", () => {
  const items = [
    conv({ id: "1", name: "Sarah", channel: "sms", origin: "form" }),
    conv({ id: "2", name: "Ryan", channel: "email", origin: "chat" }),
    conv({ id: "3", name: "Dana", channel: "sms", origin: "paid" }),
  ];
  it("filters by channel", () => {
    expect(
      filterConversations(items, {
        channel: "sms",
        source: "all",
        search: "",
      }).map((c) => c.id),
    ).toEqual(["1", "3"]);
  });
  it("filters by source", () => {
    expect(
      filterConversations(items, {
        channel: "all",
        source: "chat",
        search: "",
      }).map((c) => c.id),
    ).toEqual(["2"]);
  });
  it("filters by channel and source together", () => {
    expect(
      filterConversations(items, {
        channel: "sms",
        source: "paid",
        search: "",
      }).map((c) => c.id),
    ).toEqual(["3"]);
  });
  it("filters by search over name and preview", () => {
    expect(
      filterConversations(items, {
        channel: "all",
        source: "all",
        search: "ryan",
      }).map((c) => c.id),
    ).toEqual(["2"]);
  });
});

describe("countByChannel", () => {
  it("counts using the resilient accessor", () => {
    const counts = countByChannel([
      conv({ channel: "sms" }),
      conv({ channel: "sms" }),
      conv({ channel: "email" }),
      conv({ lastMessageType: "TYPE_SMS", channel: undefined }),
    ]);
    expect(counts.sms).toBe(3);
    expect(counts.email).toBe(1);
  });
});
