import { describe, expect, it } from "vitest";
import {
  EXPORT_THRESHOLD,
  batchDate,
  explainFlags,
  isQualified,
  partitionForSend,
  scoreBand,
  slugify,
  tagsForLead,
  NEW_LEAD_TAG,
  toCsv,
  zoneForState,
  type ScrapedLead,
} from "./leadScraper";

function lead(over: Partial<ScrapedLead> = {}): ScrapedLead {
  return {
    id: "1",
    businessName: "Summit Roofing",
    phoneE164: "+12145550147",
    city: "Plano",
    state: "TX",
    website: "https://summit.example",
    rating: 4.8,
    reviewCount: 42,
    icpScore: 95,
    icpFlags: [],
    sendStatus: "pending",
    sentTo: null,
    lineType: "wireless",
    ...over,
  };
}

describe("score bands", () => {
  it("never calls an unqualified row anything but low", () => {
    expect(scoreBand(0)).toBe("low");
    expect(scoreBand(null)).toBe("low");
    expect(scoreBand(49)).toBe("low");
  });

  it("bands on the way up", () => {
    expect(scoreBand(50)).toBe("low");
    expect(scoreBand(65)).toBe("medium");
    expect(scoreBand(89)).toBe("medium");
    expect(scoreBand(90)).toBe("high");
  });

  it("agrees with the SOP's export threshold", () => {
    expect(EXPORT_THRESHOLD).toBe(50);
    expect(isQualified(49)).toBe(false);
    expect(isQualified(50)).toBe(true);
    expect(isQualified(null)).toBe(false);
  });
});

describe("tags", () => {
  const run = { nicheId: "home_services", createdAt: "2026-07-30T14:03:00.000Z" };

  it("carries state, city, niche, source, batch date and score band", () => {
    expect(tagsForLead(lead(), run, "cold_call")).toEqual([
      "source-scraper",
      "niche-home-services",
      "state-tx",
      "city-plano",
      "scrape-2026-07-30",
      "score-high",
      "channel-cold-call",
      "cc new lead",
    ]);
  });

  it("marks which channel the lead was handed to", () => {
    expect(tagsForLead(lead(), run, "sms")).toContain("channel-sms");
  });

  it("gives a cold-call lead the tag that actually moves it", () => {
    // Every other tag here is descriptive and nothing watches it. This one is
    // what a GoHighLevel workflow triggers on to create the opportunity at New
    // Lead, so without it a lead sent from the Leads tab becomes a contact and
    // never reaches the board. That is exactly what used to happen: the Assign
    // leads push applied it and this one did not.
    expect(tagsForLead(lead(), run, "cold_call")).toContain(NEW_LEAD_TAG);
  });

  it("does not put an SMS lead on the cold calling board", () => {
    // The same workflow must not fire for a prospect being texted, or the SMS
    // channel quietly fills the dialing queue.
    expect(tagsForLead(lead(), run, "sms")).not.toContain(NEW_LEAD_TAG);
  });

  it("drops a part rather than tagging it blank", () => {
    const tags = tagsForLead(lead({ city: null, state: "" }), run, "sms");
    expect(tags.some((t) => t.startsWith("city-"))).toBe(false);
    expect(tags.some((t) => t.startsWith("state-"))).toBe(false);
    expect(tags).toContain("source-scraper");
  });

  it("slugs multi-word cities so a workflow filter can match them literally", () => {
    const tags = tagsForLead(lead({ city: "St. Louis Park", state: "MN" }), run, "sms");
    expect(tags).toContain("city-st-louis-park");
  });

  it("never emits an uppercase or spaced tag from a slugified part", () => {
    // The DESCRIPTIVE tags are built by slugifying free text (a city, a niche),
    // so they must come out lowercase and hyphenated or a filter on "city-"
    // stops matching.
    //
    // NEW_LEAD_TAG is exempt, and deliberately: it is not slugified, it is a
    // fixed string that has to equal what the GoHighLevel workflow triggers on
    // verbatim. The live account spells its cold-call tags with spaces ("cc new
    // lead", "cc no answer day 1"), so hyphenating this one to satisfy the rule
    // would silently stop the pipeline filling. Same reason coldCallStages.ts
    // carries spaced tags.
    const tags = tagsForLead(lead({ city: "Fair Oaks Ranch" }), run, "cold_call");
    for (const tag of tags.filter((t) => t !== NEW_LEAD_TAG)) {
      expect(tag).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("returns a blank batch date rather than guessing at today", () => {
    expect(batchDate(null)).toBe("");
    expect(batchDate("not a date")).toBe("");
    expect(batchDate("2026-07-30T14:03:00.000Z")).toBe("2026-07-30");
  });

  it("slugify trims punctuation instead of leaving dangling hyphens", () => {
    expect(slugify("  Weddington, NC!  ")).toBe("weddington-nc");
    expect(slugify("---")).toBe("");
  });
});

describe("explaining a score", () => {
  it("turns the SOP's flags into something readable", () => {
    expect(explainFlags([
      "core_primary:roofing contractor",
      "name:roof",
      "reviews_1_80",
      "website",
    ])).toEqual([
      "Its main category is roofing contractor",
      '"roof" in the business name',
      "A believable review count",
      "Has a live website",
    ]);
  });

  it("explains a rejection too, so a junk pull is diagnosable", () => {
    expect(explainFlags(["deny:plumbing@name"])).toEqual(["Rejected: plumbing@name"]);
  });

  it("passes an unknown flag through rather than hiding it", () => {
    expect(explainFlags(["something_new"])).toEqual(["something_new"]);
  });
});

describe("timezone", () => {
  it("resolves a state to a zone for the call card", () => {
    expect(zoneForState("TX")).toBe("America/Chicago");
    expect(zoneForState("ca")).toBe("America/Los_Angeles");
    expect(zoneForState("AZ")).toBe("America/Phoenix");
  });

  it("returns blank for something it cannot place", () => {
    expect(zoneForState(null)).toBe("");
    expect(zoneForState("ZZ")).toBe("");
  });
});

describe("CSV", () => {
  it("writes the SOP's four columns in the SOP's order", () => {
    const csv = toCsv([lead()]);
    expect(csv.split("\r\n")[0]).toBe("Phone,Company Name,City,State");
    expect(csv.split("\r\n")[1]).toBe("+12145550147,Summit Roofing,Plano,TX");
  });

  it("quotes a business name containing a comma", () => {
    const csv = toCsv([lead({ businessName: "Summit Roofing, Inc" })]);
    expect(csv).toContain('"Summit Roofing, Inc"');
  });

  it("escapes an embedded quote rather than breaking the row", () => {
    const csv = toCsv([lead({ businessName: 'The "Best" Roofers' })]);
    expect(csv).toContain('"The ""Best"" Roofers"');
  });

  it("renders a missing city as empty, not as the word null", () => {
    expect(toCsv([lead({ city: null, state: null })])).toContain("+12145550147,Summit Roofing,,");
  });
});

describe("what may be sent", () => {
  it("passes a qualified, unsent, named lead", () => {
    const { sendable, rejected } = partitionForSend([lead()]);
    expect(sendable).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  // The score sorts the list, it does not police it. It used to reject 18 of every
  // 23 qualified window firms while the screen still offered them to be ticked.
  it("sends a lead the score would once have refused", () => {
    const { sendable, rejected } = partitionForSend([lead({ icpScore: 10 })]);
    expect(sendable).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("refuses a lead that has already gone out", () => {
    const { rejected } = partitionForSend([lead({ sendStatus: "cold_sms_v2_batch_001_queued" })]);
    expect(rejected[0].reason).toBe("Already sent");
  });

  it("refuses a nameless row", () => {
    const { rejected } = partitionForSend([lead({ businessName: "  " })]);
    expect(rejected[0].reason).toBe("No business name");
  });

  it("honours the permanent do-not-contact list", () => {
    const { sendable, rejected } = partitionForSend([lead()], new Set(["+12145550147"]));
    expect(sendable).toHaveLength(0);
    expect(rejected[0].reason).toBe("On the do-not-contact list");
  });

  it("refuses a landline", () => {
    const { sendable, rejected } = partitionForSend([lead({ lineType: "landline" })]);
    expect(sendable).toHaveLength(0);
    expect(rejected[0].reason).toBe("Not a mobile number");
  });

  // The block map answers "unknown" for toll-free and out-of-country numbers, and
  // for a row scraped before the column existed it is null. Neither is evidence of
  // a mobile, and the whole point of the filter is that the burden runs that way.
  it("refuses a number it cannot prove is a mobile", () => {
    for (const lineType of ["unknown", null]) {
      const { sendable, rejected } = partitionForSend([lead({ lineType })]);
      expect(sendable).toHaveLength(0);
      expect(rejected[0].reason).toBe("Not a mobile number");
    }
  });

  it("sends one number once even when it is ticked twice", () => {
    const { sendable, rejected } = partitionForSend([
      lead({ id: "a" }),
      lead({ id: "b" }),
    ]);
    expect(sendable.map((l) => l.id)).toEqual(["a"]);
    expect(rejected).toEqual([{ id: "b", reason: "Duplicate number in this batch" }]);
  });

  it("reports every rejection rather than stopping at the first", () => {
    const { rejected } = partitionForSend([
      lead({ id: "b", sendStatus: "sent" }),
      lead({ id: "c", businessName: "" }),
      lead({ id: "d", lineType: "landline" }),
    ]);
    expect(rejected.map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  // The one guard Jake asked for by name: a lead that has gone out once never goes
  // out again, whatever its score and however many times it is ticked.
  it("never sends the same lead twice", () => {
    const alreadyGone = lead({ id: "x", sendStatus: "cold_call_20260818_queued", icpScore: 105 });
    const { sendable, rejected } = partitionForSend([alreadyGone]);
    expect(sendable).toHaveLength(0);
    expect(rejected).toEqual([{ id: "x", reason: "Already sent" }]);
  });
});
