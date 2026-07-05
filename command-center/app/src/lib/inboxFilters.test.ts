import { describe, expect, it } from "vitest";
import {
  channelFromType,
  classifyOrigin,
  convOrigin,
  filterConversations,
  countByChannel,
  isInboxConversation,
  CHANNELS,
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
  it("folds Instagram and Messenger to other (the inbox is SMS + email only)", () => {
    expect(channelFromType("Instagram")).toBe("other");
    expect(channelFromType("TYPE_INSTAGRAM")).toBe("other");
    expect(channelFromType("IG")).toBe("other");
    expect(channelFromType("Messenger")).toBe("other");
    expect(channelFromType("Facebook")).toBe("other");
  });
});

describe("inbox channel set", () => {
  it("surfaces only SMS and email as first-class channels", () => {
    expect(CHANNELS.map((c) => c.key)).toEqual(["sms", "email", "other"]);
  });
});

describe("isInboxConversation", () => {
  it("keeps SMS and email conversations, drops everything else", () => {
    expect(isInboxConversation(conv({ channel: "sms" }))).toBe(true);
    expect(isInboxConversation(conv({ channel: "email" }))).toBe(true);
    expect(isInboxConversation(conv({ channel: "other" }))).toBe(false);
  });
  it("drops IG/Messenger conversations that arrive without a server channel", () => {
    expect(
      isInboxConversation(
        conv({ channel: undefined, lastMessageType: "TYPE_INSTAGRAM" }),
      ),
    ).toBe(false);
  });
});

describe("classifyOrigin", () => {
  it("classifies from the source string", () => {
    expect(classifyOrigin("Facebook Ad", [])).toBe("paid"); // an ad beats bare social
    expect(classifyOrigin("Instagram DM", [])).toBe("social");
    expect(classifyOrigin("Website Form", [])).toBe("form");
    expect(classifyOrigin("Inbound Call", [])).toBe("call");
    expect(classifyOrigin("Chat Widget", [])).toBe("chat");
  });
  it("falls back to tags when source is empty", () => {
    expect(classifyOrigin("", ["Estimate"])).toBe("form");
    expect(classifyOrigin(null, ["Paid", "AC"])).toBe("paid");
  });
  it("prefers reactivation and call over a form/social source", () => {
    expect(classifyOrigin("Facebook Ad", ["Win-back"])).toBe("react");
    expect(classifyOrigin("Website Form", ["Missed Call"])).toBe("call");
  });
  it("returns other when nothing matches or input is empty", () => {
    expect(classifyOrigin("", [])).toBe("other");
    expect(classifyOrigin("walk-in", ["referral"])).toBe("other");
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
