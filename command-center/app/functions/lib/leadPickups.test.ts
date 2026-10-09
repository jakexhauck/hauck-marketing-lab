import { describe, expect, it } from "vitest";
import {
  countPickups,
  durationVerdict,
  isPickupAnswer,
  summarizeTouches,
  toTouch,
  transcriptText,
} from "./leadPickups";

const base = { id: "m1", contactId: "c1", dateAdded: "2026-10-09T15:00:00Z" };

describe("toTouch", () => {
  it("drops our own outbound texts and keeps a reply as contact made", () => {
    expect(toTouch({ ...base, direction: "outbound" }, "sms")).toBeNull();
    expect(toTouch({ ...base, direction: "inbound" }, "sms")).toMatchObject({
      kind: "sms",
      picked_up: true,
      method: "inbound",
    });
  });

  it("an answered inbound call is a pickup, a missed one is kept but is not", () => {
    expect(toTouch({ ...base, direction: "inbound", status: "completed" }, "call")?.picked_up).toBe(true);
    expect(toTouch({ ...base, direction: "inbound", status: "no-answer" }, "call")).toMatchObject({
      picked_up: false,
      method: "status",
    });
  });

  it("an outbound call that never connected is decided now; a completed one waits", () => {
    expect(toTouch({ ...base, direction: "outbound", status: "busy" }, "call")?.picked_up).toBe(false);
    const done = toTouch(
      { ...base, direction: "outbound", status: "completed", meta: { call: { duration: 42 } } },
      "call",
    );
    expect(done).toMatchObject({ picked_up: null, method: null, duration_sec: 42 });
  });

  it("reads the status off meta.call when the top level has none", () => {
    expect(
      toTouch({ ...base, direction: "outbound", meta: { call: { status: "completed" } } }, "call")?.picked_up,
    ).toBeNull();
  });

  it("skips anything without an id, contact, direction or date", () => {
    expect(toTouch({ ...base, id: "", direction: "inbound" }, "sms")).toBeNull();
    expect(toTouch({ ...base, contactId: undefined, direction: "inbound" }, "sms")).toBeNull();
    expect(toTouch({ ...base, direction: "sideways" }, "sms")).toBeNull();
    expect(toTouch({ ...base, dateAdded: undefined, direction: "inbound" }, "sms")).toBeNull();
  });
});

describe("durationVerdict", () => {
  it("is 30 seconds or more", () => {
    expect(durationVerdict(29)).toBe(false);
    expect(durationVerdict(30)).toBe(true);
    expect(durationVerdict(null)).toBe(false);
  });
});

describe("transcriptText", () => {
  it("flattens GoHighLevel's sentences and tolerates junk", () => {
    expect(
      transcriptText([
        { mediaChannel: 1, transcript: "Hello?" },
        { mediaChannel: 2, transcript: " Hi, it's Bob " },
        { transcript: "" },
      ]),
    ).toBe("Speaker 1: Hello?\nSpeaker 2: Hi, it's Bob");
    expect(transcriptText({ transcription: [{ transcript: "hey" }] })).toBe("hey");
    expect(transcriptText(null)).toBe("");
    expect(transcriptText("nope")).toBe("");
  });
});

describe("isPickupAnswer", () => {
  it("wants a boolean picked_up", () => {
    expect(isPickupAnswer({ picked_up: true })).toBe(true);
    expect(isPickupAnswer({ picked_up: "yes" })).toBe(false);
    expect(isPickupAnswer(null)).toBe(false);
  });
});

describe("Pickup % inputs", () => {
  const touches = summarizeTouches([
    // a: called twice, the second got them
    { ghl_contact_id: "a", kind: "call", direction: "outbound", picked_up: false },
    { ghl_contact_id: "a", kind: "call", direction: "outbound", picked_up: true },
    // b: called, voicemail
    { ghl_contact_id: "b", kind: "call", direction: "outbound", picked_up: false },
    // c: never called, but texted in
    { ghl_contact_id: "c", kind: "sms", direction: "inbound", picked_up: true },
    // d: called, still waiting on the transcript
    { ghl_contact_id: "d", kind: "call", direction: "outbound", picked_up: null },
    // e: rang us and we missed it: not called by us, not a pickup
    { ghl_contact_id: "e", kind: "call", direction: "inbound", picked_up: false },
  ]);

  it("counts a lead called once however many times they were rung", () => {
    expect(countPickups(["a", "b", "c", "d", "e", "f"], touches)).toEqual({
      called: 4,
      pickups: 2,
      notCalled: 2,
    });
  });

  it("never puts a pickup outside the called side, so it cannot pass 100%", () => {
    for (const t of touches.values()) if (t.pickedUp) expect(t.called).toBe(true);
  });

  it("only counts the leads it is given", () => {
    expect(countPickups(["b"], touches)).toEqual({ called: 1, pickups: 0, notCalled: 0 });
  });
});
