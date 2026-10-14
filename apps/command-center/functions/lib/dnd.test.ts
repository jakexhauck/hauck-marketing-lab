import { describe, it, expect } from "vitest";
import { readContactDnd, isChannelBlocked, hasDnd } from "./dnd";

describe("readContactDnd", () => {
  // The case this module exists for. Verified against the live Willis account
  // 2026-07-29: 7 contacts with SMS switched off, every one of them dnd:false.
  it("finds a per-channel block while the flat dnd flag is false", () => {
    const dnd = readContactDnd({
      dnd: false,
      dndSettings: { SMS: { status: "active", message: "TWILIO_ERROR_CODE: 30006" } },
    });
    expect(dnd).toEqual({
      all: false,
      channels: ["SMS"],
      reasons: { SMS: "TWILIO_ERROR_CODE: 30006" },
    });
  });

  it("reads the contact-level switch", () => {
    expect(readContactDnd({ dnd: true })).toEqual({ all: true, channels: [], reasons: {} });
  });

  // "inactive" is what GHL leaves behind on a channel that WAS blocked, so
  // testing for the key's presence rather than its status would report a
  // contact as unreachable forever.
  it("ignores an inactive channel", () => {
    const dnd = readContactDnd({
      dnd: false,
      dndSettings: { SMS: { status: "inactive", message: "TWILIO_ERROR_CODE: 30006" } },
    });
    expect(dnd).toEqual({ all: false, channels: [], reasons: {} });
  });

  it("reads the status case-insensitively", () => {
    expect(readContactDnd({ dndSettings: { SMS: { status: "ACTIVE" } } })?.channels).toEqual([
      "SMS",
    ]);
  });

  it("collects several blocked channels", () => {
    const dnd = readContactDnd({
      dnd: false,
      dndSettings: {
        SMS: { status: "active" },
        Email: { status: "inactive" },
        Call: { status: "active" },
      },
    });
    expect(dnd?.channels).toEqual(["SMS", "Call"]);
  });

  it("omits a reason GHL did not give", () => {
    expect(readContactDnd({ dndSettings: { SMS: { status: "active" } } })?.reasons).toEqual({});
  });

  // Null is "we do not know", which the UI must render as no claim. Returning
  // an all-clear object here would let a silent read failure look like proof
  // the contact is reachable.
  it("returns null when the record says nothing about DND", () => {
    expect(readContactDnd({})).toBeNull();
    expect(readContactDnd(null)).toBeNull();
    expect(readContactDnd(undefined)).toBeNull();
  });

  it("returns an all-clear object for a record that does say, and says no", () => {
    expect(readContactDnd({ dnd: false })).toEqual({ all: false, channels: [], reasons: {} });
  });

  it("survives a malformed dndSettings entry", () => {
    const dnd = readContactDnd({
      dnd: false,
      dndSettings: { SMS: null, Email: undefined, Call: { status: "active" } },
    });
    expect(dnd?.channels).toEqual(["Call"]);
  });
});

describe("isChannelBlocked", () => {
  it("blocks every channel under the contact-level switch", () => {
    const dnd = { all: true, channels: [], reasons: {} };
    expect(isChannelBlocked(dnd, "SMS")).toBe(true);
    expect(isChannelBlocked(dnd, "Email")).toBe(true);
  });

  it("blocks only the named channel otherwise", () => {
    const dnd = { all: false, channels: ["SMS"], reasons: {} };
    expect(isChannelBlocked(dnd, "SMS")).toBe(true);
    expect(isChannelBlocked(dnd, "Email")).toBe(false);
  });

  it("matches the channel case-insensitively", () => {
    const dnd = { all: false, channels: ["SMS"], reasons: {} };
    expect(isChannelBlocked(dnd, "sms")).toBe(true);
  });

  it("blocks nothing when DND is unknown", () => {
    expect(isChannelBlocked(null, "SMS")).toBe(false);
    expect(isChannelBlocked(undefined, "SMS")).toBe(false);
  });
});

describe("hasDnd", () => {
  it("is true for either kind of block and false otherwise", () => {
    expect(hasDnd({ all: true, channels: [], reasons: {} })).toBe(true);
    expect(hasDnd({ all: false, channels: ["SMS"], reasons: {} })).toBe(true);
    expect(hasDnd({ all: false, channels: [], reasons: {} })).toBe(false);
    expect(hasDnd(null)).toBe(false);
  });
});
