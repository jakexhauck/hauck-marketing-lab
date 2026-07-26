import { describe, it, expect } from "vitest";
import {
  SALES_OUTCOMES,
  OUTCOME_META,
  outcomeLabel,
  describeDeal,
  mapApiCall,
  resolveView,
  isLogged,
  isInProgress,
  todayCalls,
  upcomingCalls,
  followUpsOwed,
  historyCalls,
  needsLogging,
  needsLoggingCount,
  searchCalls,
  formatDuration,
  localDay,
  type SalesCall,
} from "./salesCalls";

// Fixed "now" so nothing here depends on the day the suite happens to run.
const NOW = new Date("2026-07-28T15:00:00.000Z");

function call(over: Partial<SalesCall> = {}): SalesCall {
  return {
    id: "c1",
    ghlAppointmentId: "appt-1",
    ghlContactId: "contact-1",
    leadId: null,
    prospectName: "Jane Smith",
    businessName: "Smith Roofing",
    phone: "(313) 555-0142",
    email: "jane@smithroofing.com",
    timezone: "",
    source: "Cold call",
    scheduledAt: "2026-07-28T18:00:00.000Z",
    appointmentStatus: "confirmed",
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    outcome: null,
    qualified: null,
    notAFitReason: null,
    followUpAt: null,
    sections: {},
    scratchpad: "",
    deal: null,
    cashCollected: null,
    ...over,
  };
}

describe("the outcome vocabulary", () => {
  // The server copy and the CHECK constraint in migration 0057 must agree with
  // this list, or a button writes a value the database refuses.
  it("is exactly the four stored outcomes", () => {
    expect([...SALES_OUTCOMES]).toEqual(["closed", "follow_up", "no_show", "not_a_fit"]);
  });

  it("describes every outcome it offers", () => {
    for (const outcome of SALES_OUTCOMES) {
      expect(OUTCOME_META[outcome].label).toBeTruthy();
      expect(OUTCOME_META[outcome].meaning).toBeTruthy();
    }
  });

  it("says a call is not logged rather than inventing a label", () => {
    expect(outcomeLabel(null)).toBe("Not logged");
    expect(outcomeLabel("nonsense")).toBe("Not logged");
    expect(outcomeLabel("closed")).toBe("Closed");
  });
});

describe("describeDeal", () => {
  it("reads out only what was agreed", () => {
    expect(describeDeal({ upfrontFee: 1500, monthlyRetainer: 2000, contractMonths: 3 })).toBe(
      "$1,500 upfront, $2,000/mo, 3 months",
    );
  });

  it("covers a performance deal", () => {
    expect(describeDeal({ upfrontFee: 1000, revSharePct: 10 })).toBe(
      "$1,000 upfront, 10% of revenue",
    );
  });

  it("is empty for no deal", () => {
    expect(describeDeal(null)).toBe("");
    expect(describeDeal({})).toBe("");
  });
});

describe("mapApiCall", () => {
  it("maps the table's snake_case into the shape the page reads", () => {
    const mapped = mapApiCall({
      id: "x",
      ghl_appointment_id: "appt-9",
      prospect_name: "Mike Delgado",
      scheduled_at: "2026-07-28T18:00:00.000Z",
      appointment_status: "confirmed",
      outcome: "closed",
      qualified: true,
      cash_collected: "1500.00",
      sections: { situation: "3 vans" },
      deal: { upfrontFee: 1500 },
    });
    expect(mapped.prospectName).toBe("Mike Delgado");
    expect(mapped.cashCollected).toBe(1500);
    expect(mapped.qualified).toBe(true);
    expect(mapped.sections.situation).toBe("3 vans");
    expect(mapped.deal?.upfrontFee).toBe(1500);
  });

  it("turns absent values into null rather than into zero or empty objects", () => {
    const mapped = mapApiCall({ id: "x" });
    expect(mapped.cashCollected).toBeNull();
    expect(mapped.qualified).toBeNull();
    expect(mapped.outcome).toBeNull();
    expect(mapped.deal).toBeNull();
    expect(mapped.sections).toEqual({});
  });
});

describe("resolveView", () => {
  it("falls back to Today for anything unknown", () => {
    expect(resolveView(null)).toBe("today");
    expect(resolveView("nonsense")).toBe("today");
  });

  it("keeps a known view so the tab is linkable", () => {
    expect(resolveView("history")).toBe("history");
    expect(resolveView("follow-ups")).toBe("follow-ups");
  });
});

describe("call state", () => {
  it("counts a call as logged once it has an outcome", () => {
    expect(isLogged(call())).toBe(false);
    expect(isLogged(call({ outcome: "no_show" }))).toBe(true);
  });

  it("counts a started, unfinished call as in progress", () => {
    expect(isInProgress(call({ startedAt: "2026-07-28T18:00:00.000Z" }))).toBe(true);
  });

  it("stops calling it in progress once it is logged", () => {
    expect(
      isInProgress(call({ startedAt: "2026-07-28T18:00:00.000Z", outcome: "closed" })),
    ).toBe(false);
  });
});

describe("the four views", () => {
  const today = call({ id: "today", scheduledAt: "2026-07-28T18:00:00.000Z" });
  const tomorrow = call({ id: "tomorrow", scheduledAt: "2026-07-29T18:00:00.000Z" });
  const nextWeek = call({ id: "nextweek", scheduledAt: "2026-08-02T18:00:00.000Z" });
  const farOff = call({ id: "faroff", scheduledAt: "2026-09-15T18:00:00.000Z" });
  const past = call({ id: "past", scheduledAt: "2026-07-20T18:00:00.000Z", outcome: "closed" });

  const all = [today, tomorrow, nextWeek, farOff, past];

  it("puts only today's calls in Today", () => {
    expect(todayCalls(all, NOW).map((c) => c.id)).toEqual(["today"]);
  });

  // A logged call must not disappear from the day, or the day stops reading as
  // a day and starts reading as a to-do list that empties itself.
  it("keeps a logged call in Today", () => {
    const logged = call({ id: "done", scheduledAt: "2026-07-28T14:00:00.000Z", outcome: "closed" });
    expect(todayCalls([logged], NOW).map((c) => c.id)).toEqual(["done"]);
  });

  it("covers the next seven days in Upcoming, and excludes today", () => {
    expect(upcomingCalls(all, NOW).map((c) => c.id)).toEqual(["tomorrow", "nextweek"]);
  });

  it("puts past calls in History, newest first", () => {
    const older = call({ id: "older", scheduledAt: "2026-07-10T18:00:00.000Z" });
    expect(historyCalls([past, older], NOW).map((c) => c.id)).toEqual(["past", "older"]);
  });
});

describe("followUpsOwed", () => {
  it("owes a follow-up that has no later call against the same contact", () => {
    const owed = call({ id: "owed", outcome: "follow_up", scheduledAt: "2026-07-20T18:00:00.000Z" });
    expect(followUpsOwed([owed], NOW).map((c) => c.id)).toEqual(["owed"]);
  });

  // The whole point of the view: it clears itself when the work is done.
  it("stops owing once a later call with that contact exists", () => {
    const first = call({ id: "first", outcome: "follow_up", scheduledAt: "2026-07-20T18:00:00.000Z" });
    const second = call({ id: "second", scheduledAt: "2026-07-28T18:00:00.000Z" });
    expect(followUpsOwed([first, second], NOW)).toEqual([]);
  });

  // Two prospects can share a name; nothing may fall out of this view by
  // accident.
  it("matches on contact id, not on name", () => {
    const first = call({
      id: "first",
      outcome: "follow_up",
      ghlContactId: "contact-a",
      scheduledAt: "2026-07-20T18:00:00.000Z",
    });
    const otherPerson = call({
      id: "other",
      prospectName: "Jane Smith",
      ghlContactId: "contact-b",
      scheduledAt: "2026-07-28T18:00:00.000Z",
    });
    expect(followUpsOwed([first, otherPerson], NOW).map((c) => c.id)).toEqual(["first"]);
  });

  it("ignores calls that ended any other way", () => {
    expect(followUpsOwed([call({ outcome: "closed" }), call({ outcome: "no_show" })], NOW)).toEqual(
      [],
    );
  });

  it("holds back a follow-up dated well into the future", () => {
    const later = call({
      id: "later",
      outcome: "follow_up",
      scheduledAt: "2026-07-20T18:00:00.000Z",
      followUpAt: "2026-08-20T18:00:00.000Z",
    });
    expect(followUpsOwed([later], NOW)).toEqual([]);
  });

  it("shows a follow-up whose date has arrived", () => {
    const due = call({
      id: "due",
      outcome: "follow_up",
      scheduledAt: "2026-07-20T18:00:00.000Z",
      followUpAt: "2026-07-27T18:00:00.000Z",
    });
    expect(followUpsOwed([due], NOW).map((c) => c.id)).toEqual(["due"]);
  });
});

describe("needsLogging", () => {
  // Without this, Sales Data silently under-counts every call Jake ran without
  // opening the page.
  it("flags a past call nobody logged", () => {
    expect(needsLogging(call({ scheduledAt: "2026-07-20T18:00:00.000Z" }), NOW)).toBe(true);
  });

  it("leaves a logged call alone", () => {
    expect(
      needsLogging(call({ scheduledAt: "2026-07-20T18:00:00.000Z", outcome: "no_show" }), NOW),
    ).toBe(false);
  });

  it("does not flag a call that has not happened yet", () => {
    expect(needsLogging(call({ scheduledAt: "2026-07-29T18:00:00.000Z" }), NOW)).toBe(false);
  });

  it("counts how many are outstanding, for the nudge on the tab", () => {
    const rows = [
      call({ id: "a", scheduledAt: "2026-07-20T18:00:00.000Z" }),
      call({ id: "b", scheduledAt: "2026-07-21T18:00:00.000Z" }),
      call({ id: "c", scheduledAt: "2026-07-22T18:00:00.000Z", outcome: "closed" }),
    ];
    expect(needsLoggingCount(rows, NOW)).toBe(2);
  });
});

describe("searchCalls", () => {
  it("finds a call by business name", () => {
    expect(searchCalls([call()], "roofing").length).toBe(1);
  });

  it("finds a call by phone", () => {
    expect(searchCalls([call()], "555-0142").length).toBe(1);
  });

  it("returns everything for an empty query", () => {
    expect(searchCalls([call()], "   ").length).toBe(1);
  });

  it("returns nothing for a miss", () => {
    expect(searchCalls([call()], "landscaping").length).toBe(0);
  });
});

describe("formatDuration", () => {
  it("reads as minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(1800)).toBe("30:00");
  });

  it("grows an hours field once it needs one", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("is empty for an unknown duration", () => {
    expect(formatDuration(null)).toBe("");
  });
});

describe("localDay", () => {
  it("is empty for a missing or unparseable time", () => {
    expect(localDay(null)).toBe("");
    expect(localDay("not a date")).toBe("");
  });
});
