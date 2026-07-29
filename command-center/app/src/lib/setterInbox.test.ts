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
  groupThreadsByPipeline,
  pipelineGroupLabel,
  dndBadgeLabel,
  dndSendWarning,
  isChannelBlocked,
  NO_PIPELINE_KEY,
  NO_PIPELINE_LABEL,
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

describe("pipelineGroupLabel", () => {
  it("strips the CRM numbering prefix and the Pipeline suffix", () => {
    expect(pipelineGroupLabel("1) Lead Form Pipeline")).toBe("Lead Form");
    expect(pipelineGroupLabel("4) Sales Pipeline")).toBe("Sales");
  });

  it("leaves a plain name alone", () => {
    expect(pipelineGroupLabel("Google Reviews")).toBe("Google Reviews");
  });

  it("falls back to the raw name rather than emptying it", () => {
    expect(pipelineGroupLabel("Pipeline")).toBe("Pipeline");
    expect(pipelineGroupLabel("2)")).toBe("2)");
  });
});

describe("groupThreadsByPipeline", () => {
  const t = (
    contactId: string,
    pipelineId: string | null,
    pipelineName: string | null,
    stageName: string | null = null,
  ) => ({ contactId, pipelineId, pipelineName, stageName });

  it("cuts the window into one group per pipeline", () => {
    const groups = groupThreadsByPipeline([
      t("a", "p1", "1) Lead Form Pipeline"),
      t("b", "p2", "2) No Answer Pipeline"),
      t("c", "p1", "1) Lead Form Pipeline"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Lead Form", "No Answer"]);
    expect(groups[0].threads.map((x) => x.contactId)).toEqual(["a", "c"]);
  });

  it("orders groups by the agency's numbering, not by first appearance", () => {
    const groups = groupThreadsByPipeline([
      t("a", "p4", "4) Sales Pipeline"),
      t("b", "p1", "1) Lead Form Pipeline"),
      t("c", "p2", "2) No Answer Pipeline"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["p1", "p2", "p4"]);
  });

  it("sorts an unnumbered pipeline after every numbered one", () => {
    const groups = groupThreadsByPipeline([
      t("a", "px", "Google Reviews"),
      t("b", "p1", "1) Lead Form Pipeline"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["p1", "px"]);
  });

  it("collects contacts with no opportunity into their own last group", () => {
    const groups = groupThreadsByPipeline([
      t("a", null, null),
      t("b", "p1", "1) Lead Form Pipeline"),
      t("c", null, null),
    ]);
    expect(groups).toHaveLength(2);
    const last = groups[groups.length - 1];
    expect(last.key).toBe(NO_PIPELINE_KEY);
    expect(last.label).toBe(NO_PIPELINE_LABEL);
    expect(last.threads.map((x) => x.contactId)).toEqual(["a", "c"]);
  });

  // "Not in a pipeline" is pinned last even when its name would otherwise sort
  // it first, so its position never moves as a client's pipelines change.
  it("pins the no-pipeline group last against an unnumbered pipeline", () => {
    const groups = groupThreadsByPipeline([
      t("a", null, null),
      t("b", "px", "Google Reviews"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["px", NO_PIPELINE_KEY]);
  });

  it("keeps recency order inside a group", () => {
    const groups = groupThreadsByPipeline([
      t("newest", "p1", "1) Lead Form Pipeline"),
      t("older", "p1", "1) Lead Form Pipeline"),
      t("oldest", "p1", "1) Lead Form Pipeline"),
    ]);
    expect(groups[0].threads.map((x) => x.contactId)).toEqual([
      "newest",
      "older",
      "oldest",
    ]);
  });

  it("returns nothing for an empty window", () => {
    expect(groupThreadsByPipeline([])).toEqual([]);
  });
});

describe("dndBadgeLabel", () => {
  it("names a single blocked channel", () => {
    expect(dndBadgeLabel({ all: false, channels: ["SMS"] })).toBe("No SMS");
  });

  it("names two", () => {
    expect(dndBadgeLabel({ all: false, channels: ["SMS", "Email"] })).toBe("No SMS or Email");
  });

  it("collapses three or more, which would not fit the row", () => {
    expect(dndBadgeLabel({ all: false, channels: ["SMS", "Email", "Call"] })).toBe(
      "3 channels off",
    );
  });

  it("says Do not disturb for the contact-level switch", () => {
    expect(dndBadgeLabel({ all: true, channels: [] })).toBe("Do not disturb");
  });

  // Silence for both "nothing blocked" and "we never saw the record": the only
  // claim this app makes about DND is a block it actually observed, so there
  // is deliberately no all-clear label to return.
  it("says nothing when nothing is blocked or nothing is known", () => {
    expect(dndBadgeLabel({ all: false, channels: [] })).toBeNull();
    expect(dndBadgeLabel(null)).toBeNull();
    expect(dndBadgeLabel(undefined)).toBeNull();
  });
});

describe("isChannelBlocked (client mirror)", () => {
  it("blocks everything under the contact-level switch", () => {
    expect(isChannelBlocked({ all: true, channels: [] }, "Email")).toBe(true);
  });

  it("blocks only the named channel otherwise, case-insensitively", () => {
    const dnd = { all: false, channels: ["SMS"] };
    expect(isChannelBlocked(dnd, "SMS")).toBe(true);
    expect(isChannelBlocked(dnd, "sms")).toBe(true);
    expect(isChannelBlocked(dnd, "Email")).toBe(false);
  });

  it("blocks nothing when DND is unknown", () => {
    expect(isChannelBlocked(null, "SMS")).toBe(false);
  });
});

describe("dndSendWarning", () => {
  it("says the message will not reach them, and why", () => {
    const msg = dndSendWarning(
      { all: false, channels: ["SMS"], reasons: { SMS: "TWILIO_ERROR_CODE: 30006" } },
      "SMS",
    );
    expect(msg).toMatch(/will not reach them/i);
    expect(msg).toMatch(/TWILIO_ERROR_CODE: 30006/);
  });

  it("works without a reason", () => {
    const msg = dndSendWarning({ all: false, channels: ["SMS"] }, "SMS");
    expect(msg).toMatch(/will not reach them/i);
    expect(msg).not.toMatch(/reason/i);
  });

  it("names Do Not Disturb for the contact-level switch", () => {
    expect(dndSendWarning({ all: true, channels: [] }, "Email")).toMatch(/Do Not Disturb/i);
  });

  it("finds the reason even when GHL's casing differs from the composer's", () => {
    const msg = dndSendWarning(
      { all: false, channels: ["SMS"], reasons: { sms: "TWILIO_ERROR_CODE: 30003" } },
      "SMS",
    );
    expect(msg).toMatch(/30003/);
  });

  it("stays silent for a channel that is not blocked", () => {
    expect(dndSendWarning({ all: false, channels: ["SMS"] }, "Email")).toBeNull();
    expect(dndSendWarning(null, "SMS")).toBeNull();
  });
});
