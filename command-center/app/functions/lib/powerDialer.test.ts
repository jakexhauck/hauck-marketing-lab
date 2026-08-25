import { describe, expect, it } from "vitest";
import {
  BOOKED_STATUS,
  DEFAULT_WINDOW_MINUTES,
  awaitsOutcome,
  judgedNearby,
  MATCH_AFTER_MS,
  MATCH_BEFORE_MS,
  MAX_WINDOW_MINUTES,
  readWindowMinutes,
  conversationMs,
  conversationsToOpen,
  isLiveCall,
  matchCall,
  outboundCallsSince,
  splitContactName,
  tallyDials,
  type KnownDial,
  type RecentConversation,
} from "./powerDialer";
import type { GhlCallMessage } from "./coldCallBridge";

const T = Date.parse("2026-08-17T15:00:00.000Z");

function conv(over: Partial<RecentConversation> = {}): RecentConversation {
  return {
    id: "conv-1",
    contactId: "contact-1",
    fullName: "Reid Roofing",
    lastMessageDate: T,
    ...over,
  };
}

function dial(over: Partial<KnownDial> = {}): KnownDial {
  return {
    id: "dial-1",
    contactId: "contact-1",
    callMessageId: null,
    dialedAtMs: T,
    ...over,
  };
}

function call(over: Partial<GhlCallMessage> = {}): GhlCallMessage {
  return {
    id: "msg-1",
    direction: "outbound",
    messageType: "TYPE_CAMPAIGN_CALL",
    dateAdded: new Date(T).toISOString(),
    ...over,
  };
}

describe("readWindowMinutes", () => {
  it("defaults when the parameter is absent, which Number() calls zero", () => {
    // The bug this exists for: Number(null) is 0, 0 is finite, and a 0 clamped
    // to 1 is a one minute window that hides every call before the last one.
    expect(readWindowMinutes(null)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(readWindowMinutes(undefined)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(readWindowMinutes("")).toBe(DEFAULT_WINDOW_MINUTES);
    expect(readWindowMinutes("   ")).toBe(DEFAULT_WINDOW_MINUTES);
  });

  it("defaults on anything that is not a number", () => {
    expect(readWindowMinutes("twenty")).toBe(DEFAULT_WINDOW_MINUTES);
  });

  it("takes a number and holds it inside the range", () => {
    expect(readWindowMinutes("45")).toBe(45);
    expect(readWindowMinutes("0")).toBe(1);
    expect(readWindowMinutes("-5")).toBe(1);
    expect(readWindowMinutes("9999")).toBe(MAX_WINDOW_MINUTES);
  });
});

describe("conversationMs", () => {
  it("reads the epoch millis GHL actually sends", () => {
    expect(conversationMs(conv({ lastMessageDate: T }))).toBe(T);
  });

  it("tolerates the ISO string the docs promise", () => {
    expect(conversationMs(conv({ lastMessageDate: "2026-08-17T15:00:00.000Z" }))).toBe(T);
  });

  it("is null rather than NaN when there is nothing to read", () => {
    expect(conversationMs(conv({ lastMessageDate: null }))).toBeNull();
    expect(conversationMs(conv({ lastMessageDate: "not a date" }))).toBeNull();
  });
});

describe("conversationsToOpen", () => {
  it("skips a conversation with no contact to attribute it to", () => {
    expect(conversationsToOpen([conv({ contactId: null })], [], T - 60_000)).toEqual([]);
  });

  it("skips anything older than the window", () => {
    expect(conversationsToOpen([conv({ lastMessageDate: T - 60 * 60_000 })], [], T - 60_000))
      .toEqual([]);
  });

  it("skips a conversation whose newest call is already a row", () => {
    const known = [dial({ callMessageId: "msg-1", dialedAtMs: T })];
    expect(conversationsToOpen([conv()], known, T - 20 * 60_000)).toEqual([]);
  });

  it("opens it again once something newer than that row lands", () => {
    const known = [dial({ callMessageId: "msg-1", dialedAtMs: T })];
    const later = conv({ lastMessageDate: T + 5 * 60_000 });
    expect(conversationsToOpen([later], known, T - 20 * 60_000)).toEqual([later]);
  });

  it("does not let a hand-written row (no message id) suppress the fetch", () => {
    // The row exists but carries no call, so the call it belongs to has never
    // been read. Skipping here is what would leave it without a duration.
    expect(conversationsToOpen([conv()], [dial()], T - 20 * 60_000)).toHaveLength(1);
  });

  it("returns newest first and caps the burst", () => {
    const convs = [
      conv({ id: "a", contactId: "c-a", lastMessageDate: T - 3_000 }),
      conv({ id: "b", contactId: "c-b", lastMessageDate: T - 1_000 }),
      conv({ id: "c", contactId: "c-c", lastMessageDate: T - 2_000 }),
    ];
    expect(conversationsToOpen(convs, [], T - 60_000, 2).map((c) => c.id)).toEqual(["b", "c"]);
  });
});

describe("matchCall", () => {
  const target = { callMessageId: "msg-1", contactId: "contact-1", atMs: T };

  it("recognises a call it has already recorded", () => {
    expect(matchCall([dial({ callMessageId: "msg-1" })], target)).toEqual({ kind: "known" });
  });

  it("recognises it by id even when the timestamps disagree wildly", () => {
    const known = [dial({ callMessageId: "msg-1", dialedAtMs: T + 60 * 60_000 })];
    expect(matchCall(known, target)).toEqual({ kind: "known" });
  });

  it("stamps the row a caller wrote by hand for the same call", () => {
    // Pressed the outcome ninety seconds after the call began.
    const known = [dial({ id: "hand", dialedAtMs: T + 90_000 })];
    expect(matchCall(known, target)).toEqual({ kind: "stamp", dialId: "hand" });
  });

  it("stamps the nearest hand-written row when a prospect was called twice", () => {
    const known = [
      dial({ id: "far", dialedAtMs: T + 10 * 60_000 }),
      dial({ id: "near", dialedAtMs: T + 30_000 }),
    ];
    expect(matchCall(known, target)).toEqual({ kind: "stamp", dialId: "near" });
  });

  it("never stamps another prospect's row", () => {
    expect(matchCall([dial({ contactId: "contact-2" })], target)).toEqual({ kind: "new" });
  });

  it("never stamps a row that is already somebody else's call", () => {
    const known = [dial({ callMessageId: "msg-other" })];
    expect(matchCall(known, target)).toEqual({ kind: "new" });
  });

  it("holds the window at both ends", () => {
    expect(matchCall([dial({ dialedAtMs: T - MATCH_BEFORE_MS - 1 })], target).kind).toBe("new");
    expect(matchCall([dial({ dialedAtMs: T - MATCH_BEFORE_MS })], target).kind).toBe("stamp");
    expect(matchCall([dial({ dialedAtMs: T + MATCH_AFTER_MS })], target).kind).toBe("stamp");
    expect(matchCall([dial({ dialedAtMs: T + MATCH_AFTER_MS + 1 })], target).kind).toBe("new");
  });

  it("is new when nothing has been recorded at all", () => {
    expect(matchCall([], target)).toEqual({ kind: "new" });
  });
});

describe("outboundCallsSince", () => {
  it("takes both names GoHighLevel gives a call", () => {
    const messages = [
      call({ id: "hand", messageType: "TYPE_CALL" }),
      call({ id: "dialer", messageType: "TYPE_CAMPAIGN_CALL", dateAdded: new Date(T + 1_000).toISOString() }),
    ];
    expect(outboundCallsSince(messages, T - 60_000).map((c) => c.message.id)).toEqual([
      "hand",
      "dialer",
    ]);
  });

  it("ignores texts, inbound calls and anything before the window", () => {
    const messages = [
      call({ id: "sms", messageType: "TYPE_SMS" }),
      call({ id: "inbound", direction: "inbound" }),
      call({ id: "old", dateAdded: new Date(T - 60 * 60_000).toISOString() }),
      call({ id: "keep" }),
    ];
    expect(outboundCallsSince(messages, T - 60_000).map((c) => c.message.id)).toEqual(["keep"]);
  });

  it("returns a burst oldest first, so the queue reads in the order it happened", () => {
    const messages = [
      call({ id: "third", dateAdded: new Date(T + 200_000).toISOString() }),
      call({ id: "first", dateAdded: new Date(T).toISOString() }),
      call({ id: "second", dateAdded: new Date(T + 100_000).toISOString() }),
    ];
    expect(outboundCallsSince(messages, T - 60_000).map((c) => c.message.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("drops a message with no readable timestamp rather than filing it at 1970", () => {
    expect(outboundCallsSince([call({ dateAdded: null })], 0)).toEqual([]);
  });
});

describe("splitContactName", () => {
  it("splits on the first space", () => {
    expect(splitContactName("Dave Reid")).toEqual({ firstName: "Dave", lastName: "Reid" });
  });

  it("keeps a compound surname whole", () => {
    expect(splitContactName("Ana Maria de Souza")).toEqual({
      firstName: "Ana",
      lastName: "Maria de Souza",
    });
  });

  it("is empty rather than guessing", () => {
    expect(splitContactName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("isLiveCall", () => {
  it("is live for the first few minutes", () => {
    expect(isLiveCall(T, T + 30_000)).toBe(true);
    expect(isLiveCall(T, T + 4 * 60_000)).toBe(false);
  });

  it("tolerates a clock a little ahead of ours", () => {
    expect(isLiveCall(T, T - 30_000)).toBe(true);
    expect(isLiveCall(T, T - 5 * 60_000)).toBe(false);
  });
});

describe("tallyDials", () => {
  const names = new Map([
    ["a", "Jake"],
    ["b", "Caller 2"],
  ]);

  // A row as the day tally reads it. The outcome only ever decides one thing
  // here, which is whether the row is a dial at all.
  const row = (caller_id: string | null, outcome = "no_answer") => ({ caller_id, outcome });

  it("counts every row and names who made them", () => {
    const tally = tallyDials([row("a"), row("b"), row("b")], names, "2026-08-18");
    expect(tally.total).toBe(3);
    expect(tally.day).toBe("2026-08-18");
    expect(tally.callers).toEqual([
      { callerId: "b", name: "Caller 2", dials: 2 },
      { callerId: "a", name: "Jake", dials: 1 },
    ]);
  });

  it("keeps a dial whose caller is gone in the total", () => {
    const tally = tallyDials([row("a"), row(null)], names, "2026-08-18");
    expect(tally.total).toBe(2);
    expect(tally.callers).toEqual([{ callerId: "a", name: "Jake", dials: 1 }]);
  });

  it("names a caller it cannot find rather than dropping them", () => {
    const tally = tallyDials([row("z")], names, "2026-08-18");
    expect(tally.callers[0]).toEqual({ callerId: "z", name: "Unknown caller", dials: 1 });
  });

  // The rule this whole outcome exists for. A shift that rings thirty wrong-trade
  // businesses has not made thirty calls, and before 0117 it read as though it
  // had: the number went UP the worse the list was.
  it("leaves a wrong-trade call out of the total and out of its caller's line", () => {
    const tally = tallyDials(
      [row("a"), row("a", "not_in_niche"), row("b", "not_in_niche")],
      names,
      "2026-08-18",
    );
    expect(tally.total).toBe(1);
    expect(tally.callers).toEqual([{ callerId: "a", name: "Jake", dials: 1 }]);
  });

  // not_qualified is the outcome it was being confused with, and it still counts:
  // somebody who could have bought and does not is a call that happened.
  it("still counts a not_qualified call", () => {
    expect(tallyDials([row("a", "not_qualified")], names, "2026-08-18").total).toBe(1);
  });

  // A call the phone system reported and nobody has judged yet.
  it("still counts a pending call", () => {
    expect(tallyDials([row("a", "pending")], names, "2026-08-18").total).toBe(1);
  });

  it("is a quiet zero before anybody has dialled", () => {
    expect(tallyDials([], names, "2026-08-18")).toEqual({
      day: "2026-08-18",
      total: 0,
      callers: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Who the power dialer is allowed to put on screen.
//
// Jake, 2026-08-21: "in the future don't show anyone who is already booked in".
//
// A booked prospect got rung from their own contact record to confirm the
// meeting, and because the dialer follows CALLS rather than prospects, the card
// appeared asking what that call became. Nothing could answer it: all six
// outcome buttons move a prospect through the dialing operation and this one had
// already left it with a meeting in the diary. The card simply sat there.

describe("judgedNearby", () => {
  // Live evidence, 2026-08-25. GoHighLevel's power dialer places a SECOND call
  // to the same prospect seconds after the first, with its own CallSid: Airflow
  // AC & Heating was rung at 18:36:09 for 13 seconds and again at 18:36:26 for
  // 47. Both are real calls and both become dial rows, so a caller who judged
  // the first was asked about the second the instant the sync noticed it, and
  // the card they had just cleared came back.
  const AT = Date.parse("2026-08-19T18:36:26.000Z");
  const judged = [
    { leadId: "lead-1", dialedAtMs: Date.parse("2026-08-19T18:36:09.000Z") },
  ];

  it("hides a pending call judged seconds earlier on the same prospect", () => {
    expect(judgedNearby({ leadId: "lead-1", dialedAtMs: AT }, judged)).toBe(true);
  });

  it("hides one that arrived just BEFORE the judged call", () => {
    // The press completes the newest pending row, so the leftover can be the
    // older one just as easily.
    const after = [{ leadId: "lead-1", dialedAtMs: AT }];
    expect(judgedNearby({ leadId: "lead-1", dialedAtMs: judged[0].dialedAtMs }, after)).toBe(true);
  });

  it("still asks about a genuine second call later in the shift", () => {
    // The closest real redial seen in the table was 99 seconds, and it was
    // judged separately and differently. Anything that far out is a call of its
    // own and the caller must be asked.
    const later = AT + 5 * 60_000;
    expect(judgedNearby({ leadId: "lead-1", dialedAtMs: later }, judged)).toBe(false);
  });

  it("never borrows another prospect's answer", () => {
    expect(judgedNearby({ leadId: "lead-2", dialedAtMs: AT }, judged)).toBe(false);
  });

  it("asks about a call whose prospect is not known", () => {
    // A dial the sync has not matched to anybody cannot be covered by somebody
    // else's judgement, and hiding a call nobody can account for is the wrong
    // direction.
    expect(judgedNearby({ leadId: null, dialedAtMs: AT }, judged)).toBe(false);
    expect(judgedNearby({ leadId: "lead-1", dialedAtMs: AT }, [])).toBe(false);
  });
});

describe("awaitsOutcome", () => {
  it("waits on a pending call to a prospect still in the operation", () => {
    expect(awaitsOutcome("pending", "No Answer Day 1")).toBe(true);
    expect(awaitsOutcome("pending", "New Lead")).toBe(true);
    expect(awaitsOutcome("pending", "Call Back")).toBe(true);
  });

  // THE RULE.
  it("never waits on a prospect who is already booked", () => {
    expect(awaitsOutcome("pending", BOOKED_STATUS)).toBe(false);
  });

  it("matches the stored status exactly, whitespace aside", () => {
    expect(awaitsOutcome("pending", " Booked ")).toBe(false);
    // Not a fuzzy match: a status that merely contains the word is not it.
    expect(awaitsOutcome("pending", "Booked Out")).toBe(true);
  });

  it("still waits when the prospect behind the call is unknown", () => {
    // The sync has the call but has not matched the contact yet. An unknown
    // status is not a booked one, and hiding a call nobody can account for is
    // the wrong direction to be wrong in.
    expect(awaitsOutcome("pending", null)).toBe(true);
    expect(awaitsOutcome("pending", undefined)).toBe(true);
    expect(awaitsOutcome("pending", "")).toBe(true);
  });

  it("never waits on a call that has already been judged", () => {
    expect(awaitsOutcome("no_answer", "No Answer Day 1")).toBe(false);
    expect(awaitsOutcome("booked", "Booked")).toBe(false);
    expect(awaitsOutcome("not_interested", "Not Interested")).toBe(false);
  });

  // Not Interested is the OTHER terminal status, and it is deliberately still
  // shown: Jake asked for booked. Change this test on purpose, never by
  // accident.
  it("still waits on a prospect marked not interested", () => {
    expect(awaitsOutcome("pending", "Not Interested")).toBe(true);
  });
});
