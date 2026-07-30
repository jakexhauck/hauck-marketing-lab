import { describe, expect, it } from "vitest";
import {
  canSend,
  cityKey,
  draftProblem,
  emptyDraft,
  formatRating,
  formatScore,
  isRunActive,
  parseCityLine,
  parseCityList,
  passRateLabel,
  prettyDomain,
  resolveRunRequest,
  runStatusLine,
  summariseSelection,
  type MetroCity,
  type RunDraft,
  type ScrapeRun,
  type ScrapedLeadView,
} from "./leadScraper";

const SUGGESTED: MetroCity[] = [
  { city: "Dallas TX", state: "TX", metro: "Dallas", isAnchor: true },
  { city: "Plano TX", state: "TX", metro: "Dallas", isAnchor: false },
  { city: "Frisco TX", state: "TX", metro: "Dallas", isAnchor: false },
];

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return { ...emptyDraft(), nicheId: "home_services", states: ["TX"], ...over };
}

function run(over: Partial<ScrapeRun> = {}): ScrapeRun {
  return {
    id: "r1", nicheId: "home_services", nicheLabel: "Home services",
    states: ["TX"], cities: [], size: "standard", status: "running",
    host: "jake-mac", error: null,
    totalQueries: 100, doneQueries: 40, percent: 40,
    rawFound: 500, kept: 120, added: 100, hiddenAsDuplicates: 12, rejected: 380,
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
    expect(draftProblem(draft({ nicheId: "" }), SUGGESTED)).toBe("Pick a niche.");
  });

  it("will not start without somewhere to look", () => {
    expect(draftProblem(draft({ states: [] }), SUGGESTED)).toBe("Pick at least one state.");
    expect(draftProblem(draft({ cityMode: "manual" }), [])).toBe("Add at least one city.");
  });

  it("catches a list with every city struck out", () => {
    const excluded = SUGGESTED.map((c) => cityKey(c.city, c.state));
    expect(draftProblem(draft({ excluded }), SUGGESTED)).toBe("You have struck out every city.");
  });

  it("is happy once a niche and a state are chosen", () => {
    expect(draftProblem(draft(), SUGGESTED)).toBeNull();
  });
});

describe("what the wizard actually sends", () => {
  it("sends states when nothing was struck out, so the runner expands them", () => {
    const req = resolveRunRequest(draft(), SUGGESTED);
    expect(req.states).toEqual(["TX"]);
    expect(req.cities).toEqual([]);
  });

  it("switches to an explicit city list the moment one is struck out", () => {
    const req = resolveRunRequest(
      draft({ excluded: [cityKey("Frisco TX", "TX")] }),
      SUGGESTED,
    );
    expect(req.states).toEqual([]);
    expect(req.cities.map((c) => c.city)).toEqual(["Dallas TX", "Plano TX"]);
  });

  it("sends only the hand-typed cities in manual mode", () => {
    const req = resolveRunRequest(
      draft({ cityMode: "manual", manualCities: [{ city: "Boise", state: "ID" }] }),
      SUGGESTED,
    );
    expect(req.states).toEqual([]);
    expect(req.cities).toEqual([{ city: "Boise", state: "ID" }]);
  });

  it("carries the run size through", () => {
    expect(resolveRunRequest(draft({ size: "deep" }), SUGGESTED).size).toBe("deep");
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
});

describe("the selection", () => {
  it("counts what can actually go out", () => {
    const leads = [lead({ id: "a" }), lead({ id: "b", icpScore: 20 }), lead({ id: "c", sendStatus: "sent" })];
    const summary = summariseSelection(leads, new Set(["a", "b", "c"]));
    expect(summary).toEqual({
      ticked: 3,
      sendable: 1,
      blocked: 2,
      reason: "2 cannot be sent (already sent, or scored too low)",
    });
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
