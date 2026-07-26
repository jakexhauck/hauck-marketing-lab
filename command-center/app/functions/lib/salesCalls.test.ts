import { describe, it, expect } from "vitest";
import {
  isSalesOutcome,
  wasTaken,
  sanitizeNoteSections,
  sanitizeDeal,
  committedValue,
  toMoney,
  nameFromTitle,
  reconcileRow,
  countsByDay,
  dayInZone,
  isDerivedDay,
  emptyDayCounts,
  type DemoAppointment,
  type LeadFacts,
  type CountableCall,
} from "./salesCalls";

const NY = "America/New_York";

describe("outcomes", () => {
  it("accepts only the four stored outcomes", () => {
    expect(isSalesOutcome("closed")).toBe(true);
    expect(isSalesOutcome("follow_up")).toBe(true);
    expect(isSalesOutcome("no_show")).toBe(true);
    expect(isSalesOutcome("not_a_fit")).toBe(true);
    expect(isSalesOutcome("qualified")).toBe(false);
    expect(isSalesOutcome(null)).toBe(false);
  });

  // The distinction the whole show-up rate rests on.
  it("counts every outcome except a no-show as a call taken", () => {
    expect(wasTaken("closed")).toBe(true);
    expect(wasTaken("follow_up")).toBe(true);
    expect(wasTaken("not_a_fit")).toBe(true);
    expect(wasTaken("no_show")).toBe(false);
  });

  it("does not count an unlogged call as taken", () => {
    expect(wasTaken(null)).toBe(false);
    expect(wasTaken(undefined)).toBe(false);
  });
});

describe("sanitizeNoteSections", () => {
  it("keeps well-formed sections in order", () => {
    expect(
      sanitizeNoteSections([
        { id: "situation", label: "Their situation" },
        { id: "budget", label: "Budget" },
      ]),
    ).toEqual([
      { id: "situation", label: "Their situation" },
      { id: "budget", label: "Budget" },
    ]);
  });

  // One bad entry must not cost the others.
  it("drops malformed entries without discarding the good ones", () => {
    const out = sanitizeNoteSections([
      { id: "a", label: "Keep me" },
      { id: "", label: "No id" },
      { id: "b", label: "" },
      null,
      "nonsense",
      { id: "a", label: "Duplicate id" },
      { id: "c", label: "Also keep me" },
    ]);
    expect(out).toEqual([
      { id: "a", label: "Keep me" },
      { id: "c", label: "Also keep me" },
    ]);
  });

  it("returns nothing for a non-array", () => {
    expect(sanitizeNoteSections(null)).toEqual([]);
    expect(sanitizeNoteSections({ id: "x", label: "y" })).toEqual([]);
  });
});

describe("toMoney", () => {
  it("reads money the way a human types it", () => {
    expect(toMoney("$4,500.00")).toBe(4500);
    expect(toMoney(" 1500 ")).toBe(1500);
    expect(toMoney(2000)).toBe(2000);
  });

  it("refuses what is not a number, and refuses negatives", () => {
    expect(toMoney("")).toBeNull();
    expect(toMoney("soon")).toBeNull();
    expect(toMoney(-5)).toBeNull();
  });
});

describe("sanitizeDeal", () => {
  it("keeps only the components that were ticked", () => {
    expect(sanitizeDeal({ upfrontFee: "1500", monthlyRetainer: "2000" })).toEqual({
      upfrontFee: 1500,
      monthlyRetainer: 2000,
    });
  });

  it("covers a performance deal with no retainer", () => {
    expect(sanitizeDeal({ upfrontFee: 1000, revSharePct: 10 })).toEqual({
      upfrontFee: 1000,
      revSharePct: 10,
    });
  });

  it("covers a pay-per-job deal on its own", () => {
    expect(sanitizeDeal({ perJobFee: 250 })).toEqual({ perJobFee: 250 });
  });

  // "No retainer" and "a retainer of nothing" are different facts.
  it("is null when nothing was ticked", () => {
    expect(sanitizeDeal({})).toBeNull();
    expect(sanitizeDeal({ upfrontFee: "" })).toBeNull();
    expect(sanitizeDeal(null)).toBeNull();
  });

  it("refuses a revenue share above 100 percent", () => {
    expect(sanitizeDeal({ revSharePct: 400 })).toBeNull();
    expect(sanitizeDeal({ revSharePct: 100 })).toEqual({ revSharePct: 100 });
  });

  it("takes contract length only as a whole number of months", () => {
    expect(sanitizeDeal({ contractMonths: 3 })).toEqual({ contractMonths: 3 });
    expect(sanitizeDeal({ contractMonths: 2.5 })).toBeNull();
    expect(sanitizeDeal({ contractMonths: 0 })).toBeNull();
  });
});

describe("committedValue", () => {
  it("adds the upfront fee to the retainer over its term", () => {
    expect(committedValue({ upfrontFee: 1500, monthlyRetainer: 2000, contractMonths: 3 })).toBe(7500);
  });

  it("is the upfront fee alone when no term was agreed", () => {
    expect(committedValue({ upfrontFee: 1500, monthlyRetainer: 2000 })).toBe(1500);
  });

  // Both depend on work that has not happened, so neither is a committed number.
  it("ignores revenue share and per-job fees", () => {
    expect(committedValue({ revSharePct: 10, perJobFee: 250 })).toBe(0);
  });

  it("is zero for no deal", () => {
    expect(committedValue(null)).toBe(0);
  });
});

describe("nameFromTitle", () => {
  it("recovers the name a cold-call booking puts in the title", () => {
    expect(nameFromTitle("Discovery call - Jane Smith")).toBe("Jane Smith");
  });

  it("is empty when the title carries no name", () => {
    expect(nameFromTitle("Appointment")).toBe("");
  });
});

describe("reconcileRow", () => {
  const appt: DemoAppointment = {
    id: "appt-1",
    title: "Discovery call - Jane Smith",
    startTime: "2026-07-28T18:00:00.000Z",
    status: "Confirmed",
    contactId: "contact-1",
    contactName: "Jane S",
  };

  const lead: LeadFacts = {
    id: "lead-1",
    firstName: "Jane",
    lastName: "Smith",
    businessName: "Smith Roofing",
    phone: "(313) 555-0142",
    email: "jane@smithroofing.com",
    timezone: "America/Detroit",
    source: "Cold call",
    };

  it("prefers what the lead book knows over what the calendar guessed", () => {
    const row = reconcileRow(appt, lead);
    expect(row.prospect_name).toBe("Jane Smith");
    expect(row.business_name).toBe("Smith Roofing");
    expect(row.phone).toBe("(313) 555-0142");
    expect(row.lead_id).toBe("lead-1");
  });

  it("falls back to the calendar's contact name with no lead", () => {
    expect(reconcileRow(appt, null).prospect_name).toBe("Jane S");
  });

  it("falls back to the title when the calendar has no contact name either", () => {
    const row = reconcileRow({ ...appt, contactName: "" }, null);
    expect(row.prospect_name).toBe("Jane Smith");
  });

  // A card nobody can identify is worse than an honest placeholder.
  it("never produces an empty name", () => {
    const row = reconcileRow({ ...appt, contactName: "", title: "Appointment" }, null);
    expect(row.prospect_name).toBe("Unnamed prospect");
  });

  it("lowercases the appointment status so counting is case-proof", () => {
    expect(reconcileRow(appt, null).appointment_status).toBe("confirmed");
  });

  it("carries a missing contact id through as null rather than an empty string", () => {
    expect(reconcileRow({ ...appt, contactId: "" }, null).ghl_contact_id).toBeNull();
  });
});

describe("dayInZone", () => {
  // The reason this function exists: 7pm in New York is 11pm UTC the same day,
  // but 8pm is midnight UTC the NEXT day, and a UTC slice moves that call into
  // tomorrow.
  it("files a late evening call under the day it was actually held", () => {
    expect(dayInZone("2026-07-28T23:30:00.000Z", NY)).toBe("2026-07-28");
    expect(dayInZone("2026-07-29T01:30:00.000Z", NY)).toBe("2026-07-28");
  });

  it("is null for a missing or unparseable time", () => {
    expect(dayInZone(null, NY)).toBeNull();
    expect(dayInZone("not a date", NY)).toBeNull();
  });

  it("falls back to UTC rather than throwing on an unknown timezone", () => {
    expect(dayInZone("2026-07-28T12:00:00.000Z", "Mars/Olympus")).toBe("2026-07-28");
  });
});

describe("countsByDay", () => {
  const call = (over: Partial<CountableCall>): CountableCall => ({
    scheduled_at: "2026-07-28T18:00:00.000Z",
    appointment_status: "confirmed",
    outcome: null,
    qualified: null,
    cash_collected: null,
    ...over,
  });

  it("counts a booked but unlogged call on the calendar and nowhere else", () => {
    const counts = countsByDay([call({})], NY)["2026-07-28"];
    expect(counts).toEqual({ ...emptyDayCounts(), callsOnCalendar: 1 });
  });

  it("counts a close through every column it belongs in", () => {
    const counts = countsByDay(
      [call({ outcome: "closed", qualified: true, cash_collected: "1500" })],
      NY,
    )["2026-07-28"];
    expect(counts).toEqual({
      callsOnCalendar: 1,
      rescheduledCancelled: 0,
      callsTaken: 1,
      qualified: 1,
      closed: 1,
      cashCollected: 1500,
    });
  });

  it("keeps a no-show off the taken count while still counting the booking", () => {
    const counts = countsByDay([call({ outcome: "no_show" })], NY)["2026-07-28"];
    expect(counts.callsOnCalendar).toBe(1);
    expect(counts.callsTaken).toBe(0);
  });

  it("counts a cancelled appointment as cancelled", () => {
    const counts = countsByDay([call({ appointment_status: "cancelled" })], NY)["2026-07-28"];
    expect(counts.rescheduledCancelled).toBe(1);
  });

  it("counts a qualified prospect who did not buy", () => {
    const counts = countsByDay(
      [call({ outcome: "not_a_fit", qualified: true })],
      NY,
    )["2026-07-28"];
    expect(counts.qualified).toBe(1);
    expect(counts.closed).toBe(0);
    expect(counts.callsTaken).toBe(1);
  });

  it("sums cash across a day and keeps days apart", () => {
    const out = countsByDay(
      [
        call({ outcome: "closed", cash_collected: 1000 }),
        call({ outcome: "closed", cash_collected: "$2,500" }),
        call({ scheduled_at: "2026-07-29T18:00:00.000Z", outcome: "closed", cash_collected: 500 }),
      ],
      NY,
    );
    expect(out["2026-07-28"].cashCollected).toBe(3500);
    expect(out["2026-07-28"].closed).toBe(2);
    expect(out["2026-07-29"].cashCollected).toBe(500);
  });

  it("skips a call with no scheduled time rather than inventing a day for it", () => {
    expect(countsByDay([call({ scheduled_at: null })], NY)).toEqual({});
  });
});

describe("isDerivedDay", () => {
  it("locks a day that has calls on the calendar", () => {
    expect(isDerivedDay({ ...emptyDayCounts(), callsOnCalendar: 1 })).toBe(true);
  });

  // History typed before this surface existed must stay editable.
  it("leaves a day with no calls typeable", () => {
    expect(isDerivedDay(emptyDayCounts())).toBe(false);
    expect(isDerivedDay(undefined)).toBe(false);
  });
});
