import { describe, expect, it } from "vitest";
import {
  canSend,
  addCities,
  runCap,
  draftProblem,
  emptyDraft,
  formatRating,
  formatScore,
  isRunActive,
  parseCityLine,
  parseCityList,
  passRateLabel,
  sendRateLabel,
  prettyDomain,
  resolveRunRequest,
  runStatusLine,
  summariseSelection,
  type RunDraft,
  type ScrapeRun,
  type ScrapedLeadView,
} from "./leadScraper";

const PICKED = [
  { city: "Dallas", state: "TX" },
  { city: "Plano", state: "TX" },
];

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return { ...emptyDraft(), nicheId: "home_services", cities: PICKED, ...over };
}

function run(over: Partial<ScrapeRun> = {}): ScrapeRun {
  return {
    id: "r1", nicheId: "home_services", nicheLabel: "Home services",
    states: ["TX"], cities: [], size: "standard", status: "running",
    host: "jake-mac", error: null,
    totalQueries: 100, doneQueries: 40, percent: 40,
    rawFound: 500, kept: 120, passed: 41, sendable: 15, callable: 15, added: 100,
    hiddenAsDuplicates: 12, rejected: 380,
    sent: 0, passRate: 0.24, failureRate: 0, blocked: false,
    crmSnapshotCount: 900, crmSnapshotPartial: false,
    createdAt: "2026-07-30T10:00:00Z", startedAt: null, finishedAt: null,
    ...over,
  };
}

function lead(over: Partial<ScrapedLeadView> = {}): ScrapedLeadView {
  return {
    id: "1", businessName: "Summit Roofing", phoneE164: "+12145550147",
    city: "Plano", state: "TX", website: "https://www.summit.example/contact",
    rating: 4.8, reviewCount: 42, icpScore: 95, icpFlags: [],
    sendStatus: "pending", sentTo: null, sentAt: null,
    scoreBand: "high", reasons: [], category: "roofing contractor",
    metro: "Dallas", source: "gmaps", sourceKeyword: "roofing contractor",
    nicheId: "home_services", runId: "r1", createdAt: "2026-07-30T10:00:00Z",
    ...over,
  };
}

describe("the wizard", () => {
  it("will not start without a niche", () => {
    expect(draftProblem(draft({ nicheId: "" }))).toBe("Pick a niche.");
  });

  it("will not start without a city", () => {
    expect(draftProblem(draft({ cities: [] }))).toBe("Pick at least one city.");
  });

  it("is happy once a niche and a city are chosen", () => {
    expect(draftProblem(draft())).toBeNull();
  });
});

describe("how many cities a size allows", () => {
  it("is the runner's own cap, per size", () => {
    expect(runCap("quick")).toBe(1);
    expect(runCap("standard")).toBe(40);
    expect(runCap("deep")).toBe(400);
  });

  it("stops a list growing past the cap and says how many did not fit", () => {
    const incoming = [
      { city: "Dallas", state: "TX" },
      { city: "Plano", state: "TX" },
      { city: "Frisco", state: "TX" },
    ];
    const { cities, dropped } = addCities([], incoming, 2);
    expect(cities).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it("ignores a city that is already picked rather than counting it as dropped", () => {
    const { cities, dropped } = addCities(PICKED, [{ city: "plano", state: "tx" }], 2);
    expect(cities).toEqual(PICKED);
    expect(dropped).toBe(0);
  });
});

describe("what the wizard actually sends", () => {
  it("sends the cities that were ticked, never states", () => {
    const req = resolveRunRequest(draft());
    expect(req.states).toEqual([]);
    expect(req.cities).toEqual(PICKED);
  });

  // Belt and braces: the picker caps the list as it is built, and this caps it
  // again on the way out. The runner drops what it cannot fit SILENTLY, so a
  // Quick run that quietly scraped one city out of twenty-four is the failure
  // both of these exist to prevent.
  it("never sends more cities than the size will scrape", () => {
    const req = resolveRunRequest(draft({ size: "quick" }));
    expect(req.cities).toEqual([{ city: "Dallas", state: "TX" }]);
  });

  it("carries the run size through", () => {
    expect(resolveRunRequest(draft({ size: "deep" })).size).toBe("deep");
  });
});

describe("typing cities by hand", () => {
  it("splits a trailing state off the city", () => {
    expect(parseCityLine("Plano TX")).toEqual({ city: "Plano", state: "TX" });
    expect(parseCityLine("St. Louis Park MN")).toEqual({ city: "St. Louis Park", state: "MN" });
  });

  it("copes with a comma", () => {
    expect(parseCityLine("Plano, TX")).toEqual({ city: "Plano", state: "TX" });
  });

  it("keeps a city with no state rather than discarding it", () => {
    expect(parseCityLine("Plano")).toEqual({ city: "Plano", state: "" });
  });

  it("ignores blank lines instead of turning them into queries", () => {
    expect(parseCityLine("   ")).toBeNull();
    expect(parseCityList("Plano TX\n\n  \nBoise ID")).toHaveLength(2);
  });

  it("de-duplicates the same city typed twice", () => {
    expect(parseCityList("Plano TX\nplano tx")).toEqual([{ city: "Plano", state: "TX" }]);
  });

  // A live run searched Google for the literal string "Frisco / Southlake TX"
  // and no screen could ever match that back to a city.
  it("reads two cities off one slashed line, sharing the state", () => {
    expect(parseCityList("Frisco / Southlake TX")).toEqual([
      { city: "Frisco", state: "TX" },
      { city: "Southlake", state: "TX" },
    ]);
    expect(parseCityList("Leawood/Overland Park KS")).toEqual([
      { city: "Leawood", state: "KS" },
      { city: "Overland Park", state: "KS" },
    ]);
  });
});

describe("reading a run", () => {
  it("counts preparing, queued and running as active", () => {
    for (const status of ["preparing", "queued", "running"] as const) {
      expect(isRunActive(run({ status }))).toBe(true);
    }
    for (const status of ["done", "failed", "cancelled"] as const) {
      expect(isRunActive(run({ status }))).toBe(false);
    }
    expect(isRunActive(null)).toBe(false);
  });

  it("tells you to go and start the runner when a run is queued", () => {
    expect(runStatusLine(run({ status: "queued" }))).toContain("Start the runner");
  });

  it("says so plainly when Google is pushing back", () => {
    expect(runStatusLine(run({ blocked: true }))).toContain("throttling");
  });

  it("reports a finished run that found nothing without dressing it up", () => {
    expect(runStatusLine(run({ status: "done", added: 0 }))).toBe(
      "Finished. Nothing new came back.",
    );
  });

  it("surfaces the failure reason rather than a generic message", () => {
    expect(runStatusLine(run({ status: "failed", error: "gosom not installed" })))
      .toBe("gosom not installed");
  });

  it("reports the pass rate, and nothing at all before there is one", () => {
    expect(passRateLabel(run())).toBe("24% of what Google returned was worth keeping");
    expect(passRateLabel(run({ rawFound: 0 }))).toBeNull();
  });

  // 120 of 500 kept reads as a 24% run. 15 of those 500 are worth a call, which is
  // 3%. The second number is the one that decides whether a run was worth the hours.
  it("reports what is left to call, not what was stored", () => {
    expect(sendRateLabel(run())).toBe("3% of what Google returned is worth a call");
    expect(sendRateLabel(run({ rawFound: 0 }))).toBeNull();
  });

  it("says nothing rather than 0% on a run with nobody left to ring", () => {
    expect(sendRateLabel(run({ callable: 0 }))).toBeNull();
  });

  // A count that could not be read is absent, never zero. "0 to call" on a run
  // holding fifty is worse than a blank.
  it("says nothing when the count could not be read at all", () => {
    expect(sendRateLabel(run({ callable: null }))).toBeNull();
  });

  it("keeps a fraction of a percent legible instead of rounding it to nothing", () => {
    expect(sendRateLabel(run({ rawFound: 3000, callable: 12 })))
      .toBe("0.4% of what Google returned is worth a call");
  });
});

describe("the selection", () => {
  it("counts what can actually go out", () => {
    const leads = [lead({ id: "a" }), lead({ id: "b", icpScore: 20 }), lead({ id: "c", sendStatus: "sent" })];
    const summary = summariseSelection(leads, new Set(["a", "b", "c"]));
    expect(summary).toEqual({
      ticked: 3,
      sendable: 2,
      blocked: 1,
      reason: "1 cannot be sent (already sent, or no business name)",
    });
    expect(canSend(summary)).toBe(true);
  });

  it("sends a low score, because the server does", () => {
    const summary = summariseSelection([lead({ icpScore: 12 })], new Set(["1"]));
    expect(summary.sendable).toBe(1);
    expect(canSend(summary)).toBe(true);
  });

  // The bug this whole change exists to close. Every CSV-imported lead has no
  // score, `?? 0` read that as a zero, and the button refused all 75 of them.
  it("sends an unscored import, which is every row from a CSV", () => {
    const summary = summariseSelection([lead({ icpScore: null })], new Set(["1"]));
    expect(summary.sendable).toBe(1);
    expect(summary.blocked).toBe(0);
    expect(canSend(summary)).toBe(true);
  });

  it("refuses a nameless row the way the server does", () => {
    const summary = summariseSelection([lead({ businessName: "  " })], new Set(["1"]));
    expect(summary.sendable).toBe(0);
    expect(canSend(summary)).toBe(false);
  });

  it("is empty and disabled when nothing is ticked", () => {
    const summary = summariseSelection([lead()], new Set());
    expect(summary).toEqual({ ticked: 0, sendable: 0, blocked: 0, reason: null });
    expect(canSend(summary)).toBe(false);
  });
});

describe("formatting", () => {
  it("rounds a score and shows a dash for none", () => {
    expect(formatScore(94.6)).toBe("95");
    expect(formatScore(null)).toBe("-");
  });

  it("says No reviews rather than printing nulls", () => {
    expect(formatRating(null, null)).toBe("No reviews");
    expect(formatRating(4.75, 30)).toBe("4.8 (30)");
    expect(formatRating(null, 12)).toBe("12 reviews");
  });

  it("shows the domain, not the URL", () => {
    expect(prettyDomain("https://www.summit.example/contact")).toBe("summit.example");
    expect(prettyDomain("summit.example/x")).toBe("summit.example");
    expect(prettyDomain(null)).toBe("");
  });
});
