import { describe, it, expect } from "vitest";
import {
  SEND_CHANNELS,
  isSendChannel,
  defaultChannelFor,
  sendBlockReason,
  sendErrorMessage,
  isOutbound,
  formatMessageStamp,
  previewText,
} from "./setterInbox";

describe("SEND_CHANNELS", () => {
  it("offers exactly SMS and Email", () => {
    expect(SEND_CHANNELS.map((c) => c.value)).toEqual(["SMS", "Email"]);
  });

  it("recognises only those two", () => {
    expect(isSendChannel("SMS")).toBe(true);
    expect(isSendChannel("Email")).toBe(true);
    expect(isSendChannel("WhatsApp")).toBe(false);
    expect(isSendChannel("")).toBe(false);
  });
});

describe("defaultChannelFor", () => {
  it("opens on Email when the thread's last message was email", () => {
    expect(defaultChannelFor("Email")).toBe("Email");
    expect(defaultChannelFor("TYPE_EMAIL")).toBe("Email");
  });

  it("falls back to SMS for anything else", () => {
    expect(defaultChannelFor("SMS")).toBe("SMS");
    expect(defaultChannelFor("CALL")).toBe("SMS");
    expect(defaultChannelFor("")).toBe("SMS");
    expect(defaultChannelFor(null)).toBe("SMS");
    expect(defaultChannelFor(undefined)).toBe("SMS");
  });
});

describe("sendBlockReason", () => {
  it("allows an SMS with a body and no subject", () => {
    expect(sendBlockReason("SMS", "on my way", "")).toBeNull();
  });

  it("blocks an empty or whitespace-only body", () => {
    expect(sendBlockReason("SMS", "", "")).toBe("Type a message before sending.");
    expect(sendBlockReason("SMS", "   \n ", "")).toBe("Type a message before sending.");
  });

  it("requires a subject for Email, which the endpoint 400s without", () => {
    expect(sendBlockReason("Email", "hi there", "")).toBe("Email needs a subject line.");
    expect(sendBlockReason("Email", "hi there", "   ")).toBe("Email needs a subject line.");
    expect(sendBlockReason("Email", "hi there", "Your estimate")).toBeNull();
  });

  it("blocks a channel the composer does not offer", () => {
    expect(sendBlockReason("WhatsApp", "hi", "")).toBe("Pick a channel before sending.");
  });

  it("reports the missing body before the missing subject", () => {
    expect(sendBlockReason("Email", "", "")).toBe("Type a message before sending.");
  });
});

describe("sendErrorMessage", () => {
  it("names the specific failures", () => {
    expect(sendErrorMessage("missing_subject")).toMatch(/subject/i);
    expect(sendErrorMessage("missing_body")).toMatch(/empty/i);
    expect(sendErrorMessage("invalid_channel")).toMatch(/channel/i);
    expect(sendErrorMessage("contact_not_found")).toMatch(/no longer exists/i);
  });

  it("warns that a send_failed may still have been delivered", () => {
    expect(sendErrorMessage("send_failed")).toMatch(/may not have been delivered/i);
  });

  it("falls back without leaking a code", () => {
    const msg = sendErrorMessage("some_unmapped_code");
    expect(msg).not.toMatch(/some_unmapped_code/);
    expect(msg).toMatch(/still here/i);
    expect(sendErrorMessage(undefined)).toMatch(/still here/i);
  });
});


describe("isOutbound", () => {
  it("reads the direction case-insensitively", () => {
    expect(isOutbound("outbound")).toBe(true);
    expect(isOutbound("OUTBOUND")).toBe(true);
    expect(isOutbound("inbound")).toBe(false);
    expect(isOutbound("")).toBe(false);
  });
});

describe("formatMessageStamp", () => {
  it("renders a readable stamp", () => {
    expect(formatMessageStamp("2026-07-21T14:05:00.000Z")).toMatch(/Jul \d+, \d+:\d\d [AP]M/);
  });

  it("returns empty for an unparseable stamp rather than Invalid Date", () => {
    expect(formatMessageStamp("not a date")).toBe("");
    expect(formatMessageStamp("")).toBe("");
  });
});

describe("previewText", () => {
  it("collapses whitespace", () => {
    expect(previewText("hello\n\n  there ")).toBe("hello there");
  });

  it("truncates past the cap", () => {
    const out = previewText("x".repeat(200));
    expect(out).toHaveLength(90);
    expect(out.endsWith("...")).toBe(true);
  });

  it("leaves a short preview alone", () => {
    expect(previewText("short")).toBe("short");
  });
});
