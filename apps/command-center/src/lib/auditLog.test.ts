import { describe, it, expect } from "vitest";
import {
  KNOWN_AUDIT_ACTIONS,
  auditActionLabel,
  isOutboundAction,
  mergeActionOptions,
  hasAuditPayload,
  summarizeAuditPayload,
  prettyAuditPayload,
  formatAuditTimestamp,
  describeAuditRange,
} from "./auditLog";

describe("auditActionLabel", () => {
  it("spells out the actions that message a customer", () => {
    expect(auditActionLabel("setter.send")).toBe("Message sent to a customer");
    expect(auditActionLabel("setter.book")).toBe("Appointment booked");
  });

  it("humanizes an unknown action instead of showing a raw key", () => {
    expect(auditActionLabel("tracker.sales_data.update")).toBe("Tracker sales data update");
    expect(auditActionLabel("cold_sms_daily.upsert")).toBe("Cold sms daily upsert");
  });

  it("does not blow up on an empty action", () => {
    expect(auditActionLabel("")).toBe("");
  });
});

describe("isOutboundAction", () => {
  it("flags only the send action", () => {
    expect(isOutboundAction("setter.send")).toBe(true);
    expect(isOutboundAction("setter.dial")).toBe(false);
    expect(isOutboundAction("client.update")).toBe(false);
  });
});

describe("mergeActionOptions", () => {
  it("surfaces an action seen in the rows but missing from the curated list", () => {
    const merged = mergeActionOptions(["setter.send"], ["brand.new.action"]);
    expect(merged).toEqual(["brand.new.action", "setter.send"]);
  });

  it("dedupes and drops empties", () => {
    const merged = mergeActionOptions(["a", "a"], ["a", "", "b"]);
    expect(merged).toEqual(["a", "b"]);
  });

  it("keeps the curated list when no rows are loaded", () => {
    expect(mergeActionOptions(KNOWN_AUDIT_ACTIONS, [])).toHaveLength(KNOWN_AUDIT_ACTIONS.length);
  });
});

describe("hasAuditPayload", () => {
  it("treats null, undefined and an empty object as no payload", () => {
    expect(hasAuditPayload(null)).toBe(false);
    expect(hasAuditPayload(undefined)).toBe(false);
    expect(hasAuditPayload({})).toBe(false);
    expect(hasAuditPayload([])).toBe(false);
  });

  it("treats any populated value as a payload", () => {
    expect(hasAuditPayload({ a: 1 })).toBe(true);
    expect(hasAuditPayload([1])).toBe(true);
    expect(hasAuditPayload("hi")).toBe(true);
  });
});

describe("summarizeAuditPayload", () => {
  it("says so when there is nothing to show", () => {
    expect(summarizeAuditPayload(null)).toBe("No details");
    expect(summarizeAuditPayload({})).toBe("No details");
  });

  it("lists the first few keys", () => {
    expect(summarizeAuditPayload({ channel: "sms", contactId: "c1" })).toBe(
      "channel: sms, contactId: c1",
    );
  });

  it("counts the keys it did not show", () => {
    const out = summarizeAuditPayload({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    expect(out).toBe("a: 1, b: 2, c: 3, +2 more");
  });

  it("truncates a long message body so it cannot wreck the row", () => {
    const body = "x".repeat(500);
    const out = summarizeAuditPayload({ body });
    expect(out.length).toBeLessThan(80);
    expect(out.endsWith("...")).toBe(true);
  });

  it("collapses newlines so a multi-line body stays on one line", () => {
    const out = summarizeAuditPayload({ body: "line one\nline two" });
    expect(out).toBe("body: line one line two");
  });

  it("describes nested values without dumping them", () => {
    expect(summarizeAuditPayload({ tags: ["a", "b"], meta: { x: 1 } })).toBe(
      "tags: 2 items, meta: {...}",
    );
  });

  it("handles an array payload", () => {
    expect(summarizeAuditPayload([1, 2, 3])).toBe("3 items");
    expect(summarizeAuditPayload([1])).toBe("1 item");
  });

  it("renders a null field as none rather than blank", () => {
    expect(summarizeAuditPayload({ staffId: null })).toBe("staffId: none");
  });
});

describe("prettyAuditPayload", () => {
  it("pretty prints JSON", () => {
    expect(prettyAuditPayload({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("has a readable fallback for an empty payload", () => {
    expect(prettyAuditPayload(null)).toBe("No details recorded.");
  });

  it("survives a circular payload", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => prettyAuditPayload(circular)).not.toThrow();
  });
});

describe("formatAuditTimestamp", () => {
  it("returns a dash for missing or unparseable input", () => {
    expect(formatAuditTimestamp(null)).toBe("-");
    expect(formatAuditTimestamp("")).toBe("-");
    expect(formatAuditTimestamp("not a date")).toBe("-");
  });

  it("formats a real ISO timestamp", () => {
    const out = formatAuditTimestamp("2026-07-21T15:04:05.000Z");
    expect(out).not.toBe("-");
    expect(out).toContain("2026");
  });
});

describe("describeAuditRange", () => {
  it("reports an empty log", () => {
    expect(describeAuditRange(0, 0, 0)).toBe("No entries");
  });

  it("gives a plain count when one page covers everything", () => {
    expect(describeAuditRange(0, 3, 3)).toBe("3 entries");
    expect(describeAuditRange(0, 1, 1)).toBe("1 entry");
  });

  it("gives a range when the log is paged", () => {
    expect(describeAuditRange(0, 50, 214)).toBe("Showing 1 to 50 of 214");
    expect(describeAuditRange(50, 50, 214)).toBe("Showing 51 to 100 of 214");
  });
});
