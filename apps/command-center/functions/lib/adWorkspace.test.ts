import { describe, expect, it } from "vitest";
import {
  cleanAds,
  emptyWorkspace,
  cleanAngles,
  cleanBlock,
  cleanCompetitors,
  cleanLine,
  cleanSlots,
  cleanUrl,
  LIMITS,
  patchColumns,
  toAdWorkspace,
  type AdWorkspaceRow,
} from "./adWorkspace";

describe("cleanLine", () => {
  it("flattens newlines and collapses whitespace", () => {
    expect(cleanLine("storm\ndamage   round", 100)).toBe("storm damage round");
  });

  it("strips control characters rather than storing them", () => {
    expect(cleanLine("a\u0001b\u0002c\u0003d", 100)).toBe("a b c d");
  });

  it("caps at the limit", () => {
    expect(cleanLine("x".repeat(500), 10)).toBe("x".repeat(10));
  });

  it("returns empty for anything that is not a string", () => {
    expect(cleanLine(null, 10)).toBe("");
    expect(cleanLine(42, 10)).toBe("");
  });
});

describe("cleanBlock", () => {
  it("keeps the line breaks the copy was written with", () => {
    expect(cleanBlock("line one\nline two", 100)).toBe("line one\nline two");
  });

  it("normalises CRLF", () => {
    expect(cleanBlock("a\r\nb", 100)).toBe("a\nb");
  });

  it("collapses a wall of blank lines to one", () => {
    expect(cleanBlock("a\n\n\n\n\nb", 100)).toBe("a\n\nb");
  });

  it("still strips every control character that is not a newline", () => {
    expect(cleanBlock("a\u0001b\tc", 100)).toBe("a b c");
  });

  // Unlike cleanLine, runs of spaces INSIDE a line survive. A script is written
  // with its own spacing, and collapsing it would be the editor rewriting copy.
  it("does not collapse spacing inside a line", () => {
    expect(cleanBlock("a   b", 100)).toBe("a   b");
  });
});

describe("cleanUrl", () => {
  it("adds a scheme to the bare host people actually paste", () => {
    expect(cleanUrl("facebook.com/ads/library/?id=1")).toBe(
      "https://facebook.com/ads/library/?id=1",
    );
  });

  it("leaves a full url alone", () => {
    expect(cleanUrl("https://example.com/x")).toBe("https://example.com/x");
  });

  it("drops a javascript: url rather than storing an unusable href", () => {
    expect(cleanUrl("javascript:alert(1)")).toBe("");
  });

  it("drops empty", () => {
    expect(cleanUrl("   ")).toBe("");
  });
});

// A competitor is JUST A LINK now. Name and notes were cut on 2026-08-07.
describe("cleanCompetitors", () => {
  it("keeps a bare link and gives it a scheme", () => {
    expect(cleanCompetitors(["facebook.com/ads/library/?id=1"])).toEqual([
      "https://facebook.com/ads/library/?id=1",
    ]);
  });

  it("keeps a link that already has one", () => {
    expect(cleanCompetitors(["https://champion.com/x"])).toEqual(["https://champion.com/x"]);
  });

  it("drops a blank, so an Add nobody filled in does not persist", () => {
    expect(cleanCompetitors(["", "   ", "champion.com"])).toEqual(["https://champion.com"]);
  });

  it("drops something that is not a link at all", () => {
    expect(cleanCompetitors(["not a url"])).toEqual([]);
  });

  // Rows written before the field was cut still have to render.
  it("reads the OLD {name,url,notes} shape and keeps only the url", () => {
    expect(
      cleanCompetitors([{ name: "Champion", url: "champion.com", notes: "Discount led." }]),
    ).toEqual(["https://champion.com"]);
  });

  it("drops an old row that never had a url", () => {
    expect(cleanCompetitors([{ name: "Champion", url: "", notes: "saw it on IG" }])).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: LIMITS.competitors + 10 }, (_, i) => `site${i}.com`);
    expect(cleanCompetitors(many)).toHaveLength(LIMITS.competitors);
  });

  it("returns empty for a non-array", () => {
    expect(cleanCompetitors("nope")).toEqual([]);
  });
});

describe("cleanAngles", () => {
  it("drops blanks and trims", () => {
    expect(cleanAngles([" energy bill ", "", "   ", "storm"])).toEqual(["energy bill", "storm"]);
  });
});

describe("cleanSlots", () => {
  it("always returns exactly three", () => {
    expect(cleanSlots(["a"], 100, false)).toEqual(["a", "", ""]);
    expect(cleanSlots(["a", "b", "c", "d"], 100, false)).toEqual(["a", "b", "c"]);
  });

  it("does not shift later slots up when an earlier one is blanked", () => {
    expect(cleanSlots(["", "b", "c"], 100, false)).toEqual(["", "b", "c"]);
  });

  it("keeps newlines when the slot is multiline", () => {
    expect(cleanSlots(["a\nb"], 100, true)[0]).toBe("a\nb");
    expect(cleanSlots(["a\nb"], 100, false)[0]).toBe("a b");
  });
});

describe("patchColumns", () => {
  it("writes only the keys the body named", () => {
    expect(patchColumns({ angles: ["storm"] })).toEqual({ angles: ["storm"] });
  });

  it("spreads the three copy slots across three columns", () => {
    expect(patchColumns({ copy: ["one", "two"] })).toEqual({
      copy_1: "one",
      copy_2: "two",
      copy_3: "",
    });
  });

  it("spreads the three headline slots", () => {
    expect(patchColumns({ headlines: ["h1", "h2", "h3"] })).toEqual({
      headline_1: "h1",
      headline_2: "h2",
      headline_3: "h3",
    });
  });

  it("is empty for an empty body, so the endpoint can refuse it", () => {
    expect(patchColumns({})).toEqual({});
  });

  // The batch's own fields went with the batch (0091). A body still carrying
  // one must write nothing rather than be quietly accepted.
  it("ignores fields that belonged to the retired batch", () => {
    expect(patchColumns({ name: "Storm", kind: "video", hook: "x" } as never)).toEqual({});
  });
});

describe("toAdWorkspace", () => {
  const row: AdWorkspaceRow = {
    tenant_id: "t1",
    competitors: ["rival.com"],
    angles: ["proof"],
    ads: [{ type: "Before and after", creativeId: "1AbC", creativeName: "ba.jpg" }],
    copy_1: "one",
    copy_2: "",
    copy_3: "three",
    headline_1: "h1",
    headline_2: "",
    headline_3: "",
    updated_at: "2026-08-06T00:00:00Z",
  };

  it("maps a row to the shape the browser reads", () => {
    const ws = toAdWorkspace(row);
    expect(ws.tenantId).toBe("t1");
    expect(ws.copy).toEqual(["one", "", "three"]);
    expect(ws.headlines).toEqual(["h1", "", ""]);
    expect(ws.competitors).toEqual(["https://rival.com"]);
    expect(ws.ads[0].type).toBe("Before and after");
  });

  it("survives jsonb that is not the shape it should be", () => {
    const ws = toAdWorkspace({ ...row, competitors: null, angles: "nope" });
    expect(ws.competitors).toEqual([]);
    expect(ws.angles).toEqual([]);
  });
});


// ---------------------------------------------------------------------------
// The flat ad list (0091). "video" is a type here, not a kind of anything.

describe("cleanAds", () => {
  it("keeps a type and its linked creative", () => {
    expect(cleanAds([{ type: "Before and after", creativeId: "1AbC_-x", creativeName: "ba.jpg" }]))
      .toEqual([{ type: "Before and after", creativeId: "1AbC_-x", creativeName: "ba.jpg" }]);
  });

  it("allows an ad with a type and no creative yet", () => {
    expect(cleanAds([{ type: "Testimonial" }])).toEqual([
      { type: "Testimonial", creativeId: "", creativeName: "" },
    ]);
  });

  it("allows a creative with no type yet", () => {
    const ads = cleanAds([{ creativeId: "1AbC", creativeName: "x.jpg" }]);
    expect(ads).toHaveLength(1);
    expect(ads[0].type).toBe("");
  });

  it("drops a row that is entirely empty, so an abandoned Add leaves nothing", () => {
    expect(cleanAds([{ type: "  ", creativeId: "", creativeName: "" }])).toEqual([]);
  });

  it("refuses a creative id that is not a Drive file id, and keeps the ad", () => {
    const ads = cleanAds([{ type: "Offer", creativeId: "../../etc/passwd", creativeName: "x" }]);
    expect(ads).toEqual([{ type: "Offer", creativeId: "", creativeName: "" }]);
  });

  it("flattens newlines in a free-text type", () => {
    expect(cleanAds([{ type: "before\nand after" }])[0].type).toBe("before and after");
  });

  it("caps the number of ads", () => {
    const many = Array.from({ length: LIMITS.ads + 10 }, (_, i) => ({ type: `t${i}` }));
    expect(cleanAds(many)).toHaveLength(LIMITS.ads);
  });

  it("caps a long type", () => {
    expect(cleanAds([{ type: "x".repeat(500) }])[0].type).toHaveLength(LIMITS.adType);
  });

  it("survives junk", () => {
    expect(cleanAds(null)).toEqual([]);
    expect(cleanAds("nope")).toEqual([]);
    expect(cleanAds([null, 7])).toEqual([]);
  });

  it("keeps the name only when the id survived, so no orphan label is stored", () => {
    const ads = cleanAds([{ type: "Offer", creativeId: "", creativeName: "ghost.jpg" }]);
    expect(ads[0].creativeName).toBe("");
  });
});

describe("patchColumns for the ad list", () => {
  it("writes the ads column when the body names it", () => {
    const update = patchColumns({ ads: [{ type: "UGC", creativeId: "", creativeName: "" }] });
    expect(update.ads).toEqual([{ type: "UGC", creativeId: "", creativeName: "" }]);
  });

  it("leaves ads alone when the body does not name it", () => {
    expect(patchColumns({ angles: ["storm"] })).not.toHaveProperty("ads");
  });

  it("accepts an empty list, so the last ad can be removed", () => {
    expect(patchColumns({ ads: [] })).toHaveProperty("ads", []);
  });
});

describe("emptyWorkspace", () => {
  it("is what a client nobody has written for reads as, not a 404", () => {
    const ws = emptyWorkspace("t9");
    expect(ws.tenantId).toBe("t9");
    expect(ws.copy).toEqual(["", "", ""]);
    expect(ws.headlines).toEqual(["", "", ""]);
    expect(ws.ads).toEqual([]);
    expect(ws.competitors).toEqual([]);
    expect(ws.angles).toEqual([]);
    // Distinguishable from a saved-then-emptied workspace, which has a date.
    expect(ws.updatedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The bug this all came from: pressing Add, clicking away without typing, and
// watching the row you just made disappear. The server is RIGHT to drop a blank
// row on the way in; the fix is that the page must not fold that answer back
// over what is on screen. These lock the server half of that contract.

describe("a blank row never reaches the table", () => {
  it("competitors: a blank is dropped, the filled ones keep their order", () => {
    expect(patchColumns({ competitors: ["a.com", "", "b.com"] }).competitors).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("angles: a blank is dropped", () => {
    expect(patchColumns({ angles: ["storm", "  ", "energy"] }).angles).toEqual([
      "storm",
      "energy",
    ]);
  });

  it("ads: a row with no type and no creative is dropped", () => {
    const ads = [
      { type: "video", creativeId: "", creativeName: "" },
      { type: "", creativeId: "", creativeName: "" },
    ];
    expect(patchColumns({ ads }).ads).toEqual([
      { type: "video", creativeId: "", creativeName: "" },
    ]);
  });

  it("ads: a row with only a creative and no type yet is KEPT", () => {
    const ads = [{ type: "", creativeId: "1AbC", creativeName: "x.jpg" }];
    expect(patchColumns({ ads }).ads).toHaveLength(1);
  });
});
