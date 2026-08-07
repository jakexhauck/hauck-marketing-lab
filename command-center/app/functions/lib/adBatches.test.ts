import { describe, expect, it } from "vitest";
import {
  cleanAngles,
  cleanBlock,
  cleanCompetitors,
  cleanLine,
  cleanSlots,
  cleanUrl,
  isAdBatchKind,
  LIMITS,
  patchColumns,
  toAdBatch,
  type AdBatchRow,
} from "./adBatches";

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

describe("cleanCompetitors", () => {
  it("keeps name, link and notes", () => {
    expect(
      cleanCompetitors([{ name: " Champion ", url: "champion.com", notes: "Discount led." }]),
    ).toEqual([{ name: "Champion", url: "https://champion.com", notes: "Discount led." }]);
  });

  it("drops a row that is empty in all three fields", () => {
    expect(cleanCompetitors([{ name: "", url: "", notes: "" }])).toEqual([]);
  });

  it("keeps a row that has only notes", () => {
    expect(cleanCompetitors([{ name: "", url: "", notes: "saw it on IG" }])).toHaveLength(1);
  });

  it("caps the list", () => {
    const many = Array.from({ length: LIMITS.competitors + 10 }, (_, i) => ({
      name: `c${i}`,
      url: "",
      notes: "",
    }));
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
    expect(patchColumns({ name: "Storm" })).toEqual({ name: "Storm" });
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

  it("never writes kind, whatever the body claims", () => {
    expect(patchColumns({ kind: "video" } as never)).toEqual({});
  });
});

describe("toAdBatch", () => {
  const row: AdBatchRow = {
    id: "b1",
    tenant_id: "t1",
    kind: "video",
    name: "Testimonial",
    competitors: [{ name: "Rival", url: "rival.com", notes: "" }],
    angles: ["proof"],
    copy_1: "one",
    copy_2: "",
    copy_3: "three",
    headline_1: "h1",
    headline_2: "",
    headline_3: "",
    hook: "watch this",
    script: "line one\nline two",
    created_at: "2026-08-06T00:00:00Z",
    updated_at: "2026-08-06T00:00:00Z",
  };

  it("maps a row to the shape the browser reads", () => {
    const batch = toAdBatch(row);
    expect(batch.kind).toBe("video");
    expect(batch.copy).toEqual(["one", "", "three"]);
    expect(batch.headlines).toEqual(["h1", "", ""]);
    expect(batch.competitors[0].url).toBe("https://rival.com");
    expect(batch.script).toBe("line one\nline two");
  });

  it("renders rather than throws when the stored kind is nonsense", () => {
    expect(toAdBatch({ ...row, kind: "carousel" }).kind).toBe("static");
  });

  it("survives jsonb that is not the shape it should be", () => {
    const batch = toAdBatch({ ...row, competitors: null, angles: "nope" });
    expect(batch.competitors).toEqual([]);
    expect(batch.angles).toEqual([]);
  });
});

describe("isAdBatchKind", () => {
  it("accepts the two kinds and nothing else", () => {
    expect(isAdBatchKind("static")).toBe(true);
    expect(isAdBatchKind("video")).toBe(true);
    expect(isAdBatchKind("carousel")).toBe(false);
    expect(isAdBatchKind(null)).toBe(false);
  });
});
