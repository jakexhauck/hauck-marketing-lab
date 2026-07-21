import { describe, it, expect } from "vitest";
import {
  DEFAULT_HUB,
  MAX_ROWS_PER_SECTION,
  MAX_SECTIONS,
  normalizeHub,
  validateHubBody,
} from "./dialHub";

// normalizeHub is the trust boundary. The document lives in a jsonb column and
// is posted whole by the client, so anything at all can arrive here: a null, a
// string, a row that is a number, ten thousand sections. Every one of those has
// to come out the far side as a document React can render without checking.

describe("DEFAULT_HUB", () => {
  it("carries the five sections from Jake's sheet", () => {
    expect(DEFAULT_HUB.sections.map((s) => s.title)).toEqual([
      "Script / Framework",
      "Calendar",
      "Resources",
      "Dialing Tags",
      "SOPs",
    ]);
  });

  it("seeds the dialing tags with their real values and leaves links blank", () => {
    const tags = DEFAULT_HUB.sections.find((s) => s.title === "Dialing Tags")!;
    expect(tags.rows.map((r) => r.value)).toEqual([
      "services-unqualified",
      "mentorship-follow-up",
      "no answer day 1",
      "no answer day 2",
      "no answer day 3",
      "no answer day 4",
    ]);

    const calendar = DEFAULT_HUB.sections.find((s) => s.title === "Calendar")!;
    expect(calendar.rows.every((r) => r.value === "")).toBe(true);
  });

  it("survives its own normalization unchanged", () => {
    expect(normalizeHub(DEFAULT_HUB)).toEqual(DEFAULT_HUB);
  });

  it("gives every row and section a unique id", () => {
    const ids = DEFAULT_HUB.sections.flatMap((s) => [s.id, ...s.rows.map((r) => r.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("normalizeHub", () => {
  it("returns the default template for a document that is not an object", () => {
    for (const junk of [null, undefined, "hub", 7, true, []]) {
      expect(normalizeHub(junk)).toEqual(DEFAULT_HUB);
    }
  });

  it("returns an empty document, not the template, when sections is empty", () => {
    // An empty hub is a real state: the admin deleted every section. It must
    // not silently resurrect the seed rows on the next read.
    expect(normalizeHub({ sections: [] })).toEqual({ sections: [] });
  });

  it("drops sections and rows that are not objects", () => {
    const hub = normalizeHub({
      sections: [null, "nope", { title: "Real", rows: [42, { label: "Keep", value: "v" }] }],
    });
    expect(hub.sections).toHaveLength(1);
    expect(hub.sections[0].rows).toHaveLength(1);
    expect(hub.sections[0].rows[0].label).toBe("Keep");
  });

  it("coerces non-string labels and values to empty strings", () => {
    const hub = normalizeHub({
      sections: [{ title: 99, rows: [{ label: {}, value: ["x"] }] }],
    });
    expect(hub.sections[0].title).toBe("");
    expect(hub.sections[0].rows[0].label).toBe("");
    expect(hub.sections[0].rows[0].value).toBe("");
  });

  it("trims whitespace off labels and values", () => {
    const hub = normalizeHub({
      sections: [{ title: "  Calendar  ", rows: [{ label: " Estimate ", value: "  x  " }] }],
    });
    expect(hub.sections[0].title).toBe("Calendar");
    expect(hub.sections[0].rows[0].label).toBe("Estimate");
    expect(hub.sections[0].rows[0].value).toBe("x");
  });

  it("backfills a deterministic id when one is missing", () => {
    const hub = normalizeHub({ sections: [{ title: "A", rows: [{ label: "r", value: "" }] }] });
    expect(hub.sections[0].id).toBe("sec-0");
    expect(hub.sections[0].rows[0].id).toBe("sec-0-row-0");
  });

  it("keeps an id the client already assigned", () => {
    const hub = normalizeHub({
      sections: [{ id: "abc", title: "A", rows: [{ id: "xyz", label: "r", value: "" }] }],
    });
    expect(hub.sections[0].id).toBe("abc");
    expect(hub.sections[0].rows[0].id).toBe("xyz");
  });

  it("rewrites duplicate ids so React keys stay unique", () => {
    const hub = normalizeHub({
      sections: [
        { id: "same", title: "A", rows: [] },
        { id: "same", title: "B", rows: [] },
      ],
    });
    expect(hub.sections[0].id).not.toBe(hub.sections[1].id);
  });

  it("caps sections and rows so one paste cannot store an unbounded document", () => {
    const hub = normalizeHub({
      sections: Array.from({ length: MAX_SECTIONS + 25 }, () => ({
        title: "S",
        rows: Array.from({ length: MAX_ROWS_PER_SECTION + 25 }, () => ({ label: "r", value: "" })),
      })),
    });
    expect(hub.sections).toHaveLength(MAX_SECTIONS);
    expect(hub.sections[0].rows).toHaveLength(MAX_ROWS_PER_SECTION);
  });

  it("truncates a label or value that is far too long", () => {
    const hub = normalizeHub({
      sections: [{ title: "A", rows: [{ label: "x".repeat(9000), value: "y".repeat(9000) }] }],
    });
    expect(hub.sections[0].rows[0].label.length).toBeLessThanOrEqual(200);
    expect(hub.sections[0].rows[0].value.length).toBeLessThanOrEqual(2000);
  });

  it("keeps a section note but drops one that is not a string", () => {
    expect(normalizeHub({ sections: [{ title: "A", note: "hi", rows: [] }] }).sections[0].note).toBe(
      "hi",
    );
    expect(normalizeHub({ sections: [{ title: "A", note: 5, rows: [] }] }).sections[0].note).toBe("");
  });

  it("treats a missing rows array as an empty section", () => {
    expect(normalizeHub({ sections: [{ title: "A" }] }).sections[0].rows).toEqual([]);
  });

  it("is idempotent", () => {
    const messy = { sections: [{ title: "  A ", rows: [{ label: 1, value: "  b " }] }] };
    const once = normalizeHub(messy);
    expect(normalizeHub(once)).toEqual(once);
  });
});

describe("validateHubBody", () => {
  it("requires a tenantId", () => {
    expect(validateHubBody({ hub: DEFAULT_HUB }).code).toBe("missing_tenant_id");
    expect(validateHubBody({ tenantId: "   ", hub: DEFAULT_HUB }).code).toBe("missing_tenant_id");
  });

  it("requires a hub object", () => {
    expect(validateHubBody({ tenantId: "t" }).code).toBe("missing_hub");
    expect(validateHubBody({ tenantId: "t", hub: "nope" }).code).toBe("missing_hub");
  });

  // The write path must be stricter than normalizeHub. A hub with no sections
  // array normalizes to the seed template, and accepting it would upsert
  // DEFAULT_HUB straight over a client's real document with a 200 and no undo.
  it("rejects a hub whose sections is missing or not an array, rather than seeding over real data", () => {
    expect(validateHubBody({ tenantId: "t", hub: {} }).code).toBe("missing_hub");
    expect(validateHubBody({ tenantId: "t", hub: { sections: null } }).code).toBe("missing_hub");
    expect(validateHubBody({ tenantId: "t", hub: { sections: "nope" } }).code).toBe("missing_hub");
  });

  it("accepts an explicitly emptied hub, which is a real state and not malformed", () => {
    expect(validateHubBody({ tenantId: "t", hub: { sections: [] } }).ok).toBe(true);
  });

  it("accepts a well-formed body", () => {
    expect(validateHubBody({ tenantId: "t", hub: DEFAULT_HUB }).ok).toBe(true);
  });
});
