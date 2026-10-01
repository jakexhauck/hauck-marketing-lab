import { describe, expect, it } from "vitest";
import {
  ALREADY_JUDGED_MS,
  PENDING_LOOKBACK_MS,
  leadFieldsForOutcome,
  parseDisposition,
  pickDispositionDial,
  type CandidateDial,
} from "./coldCallDisposition";

describe("parseDisposition", () => {
  it("reads our own keys from the top level", () => {
    expect(parseDisposition({ contactId: "c1", outcome: "no_answer" })).toEqual({
      ok: true,
      contactId: "c1",
      outcome: "no_answer",
      callId: null,
      userEmail: null,
      locationId: null,
    });
  });

  it("reads GoHighLevel's standard webhook shape", () => {
    const parsed = parseDisposition({
      contact_id: "c2",
      location: { id: "loc" },
      customData: { outcome: "pitch_no", callId: "m1", userEmail: " Jake@X.com " },
    });
    expect(parsed).toEqual({
      ok: true,
      contactId: "c2",
      outcome: "pitch_no",
      callId: "m1",
      userEmail: "jake@x.com",
      locationId: "loc",
    });
  });

  it("maps a disposition label to the outcome, ignoring case and spacing", () => {
    const parsed = parseDisposition({ contactId: "c", disposition: "  heard pitch,  said no " });
    expect(parsed.ok && parsed.outcome).toBe("pitch_no");
    const nic = parseDisposition({ contactId: "c", customData: { disposition: "Not my niche" } });
    expect(nic.ok && nic.outcome).toBe("not_in_niche");
  });

  it("prefers the fixed outcome over a label", () => {
    const parsed = parseDisposition({ contactId: "c", outcome: "booked", disposition: "No answer" });
    expect(parsed.ok && parsed.outcome).toBe("booked");
  });

  it("refuses an unknown disposition rather than guessing", () => {
    expect(parseDisposition({ contactId: "c", disposition: "Voicemail" })).toEqual({
      ok: false,
      error: "unknown_disposition",
    });
  });

  it("refuses a body with no contact", () => {
    expect(parseDisposition({ outcome: "no_answer" })).toEqual({ ok: false, error: "no_contact" });
    expect(parseDisposition(null)).toEqual({ ok: false, error: "no_contact" });
  });

  it("never accepts pending as an outcome", () => {
    expect(parseDisposition({ contactId: "c", outcome: "pending" })).toEqual({
      ok: false,
      error: "unknown_disposition",
    });
  });
});

describe("leadFieldsForOutcome", () => {
  const today = "2026-10-01";

  it("moves a first no answer to day 1 and counts it", () => {
    expect(leadFieldsForOutcome("no_answer", { no_answer: 0, first_contact_date: null }, today)).toEqual({
      status: "No Answer Day 1",
      no_answer: 1,
      last_contact: today,
      first_contact_date: today,
      follow_up_date: null,
    });
  });

  it("moves a second no answer to day 2 and keeps the first contact date", () => {
    expect(
      leadFieldsForOutcome("no_answer", { no_answer: 1, first_contact_date: "2026-09-20" }, today),
    ).toMatchObject({ status: "No Answer Day 2", no_answer: 2, first_contact_date: "2026-09-20" });
  });

  it("files every ending outcome as Not Interested", () => {
    for (const outcome of ["not_qualified", "opener_no", "pitch_no", "gatekeeper", "not_in_niche"] as const) {
      expect(leadFieldsForOutcome(outcome, { no_answer: 0, first_contact_date: null }, today)).toEqual({
        status: "Not Interested",
        last_contact: today,
        first_contact_date: today,
        follow_up_date: null,
      });
    }
  });

  it("marks a callback without inventing a date", () => {
    const fields = leadFieldsForOutcome("callback", { no_answer: 0, first_contact_date: null }, today);
    expect(fields.status).toBe("Call Back");
    expect("follow_up_date" in fields).toBe(false);
  });

  it("marks a booking", () => {
    expect(
      leadFieldsForOutcome("booked", { no_answer: 0, first_contact_date: null }, today),
    ).toMatchObject({ status: "Booked", follow_up_date: null });
  });
});

describe("pickDispositionDial", () => {
  const now = Date.parse("2026-10-01T15:00:00Z");
  const dial = (over: Partial<CandidateDial>): CandidateDial => ({
    id: "d",
    outcome: "pending",
    callMessageId: null,
    dialedAtMs: now - 60_000,
    ...over,
  });

  it("takes the newest pending dial", () => {
    const pick = pickDispositionDial(
      [dial({ id: "old", dialedAtMs: now - 30 * 60_000 }), dial({ id: "new", dialedAtMs: now - 60_000 })],
      { callId: null, now },
    );
    expect(pick).toEqual({ kind: "pending", dialId: "new" });
  });

  it("prefers the exact call when GoHighLevel names it", () => {
    const pick = pickDispositionDial(
      [dial({ id: "a", callMessageId: "m1", dialedAtMs: now - 5 * 60_000 }), dial({ id: "b", callMessageId: "m2" })],
      { callId: "m1", now },
    );
    expect(pick).toEqual({ kind: "pending", dialId: "a" });
  });

  it("reports an exact call that was already judged", () => {
    const pick = pickDispositionDial([dial({ id: "a", outcome: "no_answer", callMessageId: "m1" })], {
      callId: "m1",
      now,
    });
    expect(pick).toEqual({ kind: "judged", dialId: "a" });
  });

  it("ignores a pending dial older than the lookback", () => {
    const pick = pickDispositionDial([dial({ dialedAtMs: now - PENDING_LOOKBACK_MS - 1 })], {
      callId: null,
      now,
    });
    expect(pick).toEqual({ kind: "none" });
  });

  it("treats a recent judged dial as the same call, so nothing is counted twice", () => {
    const pick = pickDispositionDial(
      [dial({ id: "j", outcome: "pitch_no", dialedAtMs: now - ALREADY_JUDGED_MS + 1000 })],
      { callId: null, now },
    );
    expect(pick).toEqual({ kind: "judged", dialId: "j" });
  });

  it("finds nothing when the last judged dial is old", () => {
    const pick = pickDispositionDial(
      [dial({ outcome: "pitch_no", dialedAtMs: now - ALREADY_JUDGED_MS - 1000 })],
      { callId: null, now },
    );
    expect(pick).toEqual({ kind: "none" });
  });
});
