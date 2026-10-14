import { describe, it, expect } from "vitest";
import {
  buildSheetRows,
  contactName,
  fieldTokens,
  fieldValueText,
  oneLineAddress,
  surveyAnswers,
  toSheetRow,
  type SheetContact,
} from "./sheetLeads";
import type { CustomFieldDef } from "./ghl";
import type { WhenEvent } from "./leadWhen";

const NOW = Date.parse("2026-08-12T15:00:00.000Z");

const DEFS: CustomFieldDef[] = [
  { id: "cf_home", fieldKey: "contact.home_type", name: "Home Type" },
  { id: "cf_time", fieldKey: "contact.timeline", name: "Timeline" },
  { id: "cf_offer", fieldKey: "contact.offer", name: "Offer" },
  { id: "cf_junk", fieldKey: "contact.favourite_colour", name: "Favourite Colour" },
];

function contact(over: Partial<SheetContact> = {}): SheetContact {
  return {
    id: "c1",
    firstName: "Mary Anne",
    lastName: "Willis",
    phone: "+17345550142",
    email: "mary@example.com",
    dateAdded: "2026-08-10T14:00:00.000Z",
    source: "Facebook Ads",
    ...over,
  };
}

describe("oneLineAddress", () => {
  it("joins street, city, then state and zip", () => {
    expect(
      oneLineAddress(
        contact({ address1: "881 Oakwood Ave", city: "Berkley", state: "MI", postalCode: "48072" }),
      ),
    ).toBe("881 Oakwood Ave, Berkley, MI 48072");
  });

  it("leaves out what GHL does not have rather than printing gaps", () => {
    expect(oneLineAddress(contact({ city: "Berkley", state: "MI" }))).toBe("Berkley, MI");
    expect(oneLineAddress(contact())).toBe("");
  });
});

describe("contactName", () => {
  it("prefers the name GHL already assembled", () => {
    expect(contactName(contact({ contactName: "Mary Anne Willis" }))).toBe("Mary Anne Willis");
  });

  it("falls back to first + last", () => {
    expect(contactName(contact())).toBe("Mary Anne Willis");
  });

  it("does not leave a stray space when only one half exists", () => {
    expect(contactName(contact({ firstName: "Kerri", lastName: undefined }))).toBe("Kerri");
  });
});

describe("fieldValueText", () => {
  it("reads strings, numbers and multi-selects", () => {
    expect(fieldValueText("  Two stories ")).toBe("Two stories");
    expect(fieldValueText(3)).toBe("3");
    expect(fieldValueText(["Interior", "Screens"])).toBe("Interior, Screens");
    expect(fieldValueText(null)).toBe("");
  });
});

describe("surveyAnswers", () => {
  const tokens = fieldTokens(DEFS);

  it("reads the three survey fields and ignores everything else", () => {
    const c = contact({
      customFields: [
        { id: "cf_home", value: "Two stories" },
        { id: "cf_time", value: "Within a week" },
        { id: "cf_offer", value: "$100 Off Residential Window Cleaning!" },
        { id: "cf_junk", value: "Blue" },
      ],
    });
    expect(surveyAnswers(c, tokens)).toEqual({
      homeType: "Two stories",
      timeline: "Within a week",
      offer: "$100 Off Residential Window Cleaning!",
    });
  });

  // The GHL workflow that creates these fields is not built yet, so the
  // spelling is not known in advance. Matching the human name is what stops a
  // reasonably-named field from producing a permanently empty column.
  it("matches on the field name when the key is spelled differently", () => {
    const defs: CustomFieldDef[] = [
      { id: "x", fieldKey: "contact.what_type_of_home_is_it", name: "Type of Home" },
    ];
    const answers = surveyAnswers(
      contact({ customFields: [{ id: "x", value: "Condo or townhome" }] }),
      fieldTokens(defs),
    );
    expect(answers.homeType).toBe("Condo or townhome");
  });

  // Verbatim from the live Willis location, 2026-08-12. Neither timeline field
  // matches the word "timeline" exactly, and an exact-only matcher read empty
  // across all 199 contacts.
  it("finds the timeline in Willis's actual field names", () => {
    const defs: CustomFieldDef[] = [
      { id: "cf_long", fieldKey: "contact.what_is_your_timeline_for_the_window_cleaning", name: "What Is Your Timeline For The Window Cleaning" },
      { id: "cf_home", fieldKey: "contact.home_type", name: "Home Type" },
    ];
    const answers = surveyAnswers(
      contact({
        customFields: [
          { id: "cf_long", value: "Within a week" },
          { id: "cf_home", value: "Two stories" },
        ],
      }),
      fieldTokens(defs),
    );
    expect(answers.timeline).toBe("Within a week");
    expect(answers.homeType).toBe("Two stories");
  });

  it("prefers the more specific field when a location has two of them", () => {
    const defs: CustomFieldDef[] = [
      { id: "cf_long", fieldKey: "contact.what_is_your_timeline_for_the_window_cleaning", name: "What Is Your Timeline For The Window Cleaning" },
      { id: "cf_short", fieldKey: "contact.cleaning_timeline", name: "Cleaning Timeline" },
    ];
    const answers = surveyAnswers(
      contact({
        customFields: [
          { id: "cf_long", value: "the long one" },
          { id: "cf_short", value: "Within a week" },
        ],
      }),
      fieldTokens(defs),
    );
    expect(answers.timeline).toBe("Within a week");
  });

  it("is empty, not fabricated, when the contact has no custom fields", () => {
    expect(surveyAnswers(contact(), tokens)).toEqual({
      homeType: "",
      timeline: "",
      offer: "",
    });
  });
});

describe("toSheetRow", () => {
  const tokens = fieldTokens(DEFS);

  it("takes campaign and ad from the attributions array, not the utm custom fields", () => {
    const row = toSheetRow(
      contact({
        attributions: [
          {
            isFirst: true,
            utmAdId: "120251336167710415",
            utmCampaign: "7/15/26 | Lead Form | Willis Windows",
            utmContent: "SIGN 1 | $100 OFF | 7/15/2026",
          },
        ],
      }),
      tokens,
      [],
      NOW,
    );
    expect(row.campaign).toBe("7/15/26 | Lead Form | Willis Windows");
    expect(row.ad).toBe("SIGN 1 | $100 OFF | 7/15/2026");
  });

  it("leaves every appointment cell empty when there is no appointment", () => {
    const row = toSheetRow(contact(), tokens, [], NOW);
    expect(row.apptId).toBe("");
    expect(row.apptAt).toBe("");
    expect(row.apptTitle).toBe("");
  });

  it("shows the soonest upcoming appointment and skips cancelled ones", () => {
    const events: WhenEvent[] = [
      {
        id: "ev_cancelled",
        contactId: "c1",
        startTime: "2026-08-13T14:00:00.000Z",
        status: "cancelled",
        title: "Estimate",
      },
      {
        id: "ev_next",
        contactId: "c1",
        startTime: "2026-08-19T18:30:00.000Z",
        status: "confirmed",
        title: "Window Cleaning",
      },
      {
        id: "ev_later",
        contactId: "c1",
        startTime: "2026-09-02T14:00:00.000Z",
        status: "booked",
        title: "Window Cleaning",
      },
    ];
    const row = toSheetRow(contact(), tokens, events, NOW);
    expect(row.apptId).toBe("ev_next");
    expect(row.apptAt).toBe("2026-08-19T18:30:00.000Z");
    expect(row.apptTitle).toBe("Window Cleaning");
  });
});

describe("buildSheetRows", () => {
  it("returns newest first", () => {
    const rows = buildSheetRows(
      [
        contact({ id: "old", dateAdded: "2026-07-01T10:00:00.000Z" }),
        contact({ id: "new", dateAdded: "2026-08-11T10:00:00.000Z" }),
        contact({ id: "mid", dateAdded: "2026-08-01T10:00:00.000Z" }),
      ],
      DEFS,
      new Map(),
      NOW,
    );
    expect(rows.map((r) => r.contactId)).toEqual(["new", "mid", "old"]);
  });

  it("sorts a contact with no date to the bottom, never the top", () => {
    const rows = buildSheetRows(
      [
        contact({ id: "undated", dateAdded: undefined }),
        contact({ id: "dated", dateAdded: "2026-08-11T10:00:00.000Z" }),
      ],
      DEFS,
      new Map(),
      NOW,
    );
    expect(rows.map((r) => r.contactId)).toEqual(["dated", "undated"]);
  });

  it("joins each contact to its own appointments only", () => {
    const appts = new Map<string, WhenEvent[]>([
      [
        "b",
        [
          {
            id: "ev_b",
            contactId: "b",
            startTime: "2026-08-20T18:30:00.000Z",
            status: "booked",
            title: "Estimate",
          },
        ],
      ],
    ]);
    const rows = buildSheetRows(
      [contact({ id: "a" }), contact({ id: "b" })],
      DEFS,
      appts,
      NOW,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.contactId, r]));
    expect(byId.a.apptId).toBe("");
    expect(byId.b.apptId).toBe("ev_b");
  });
});
