import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  normalizeEmail,
  parseInternalRecipients,
  isInternalRecipient,
  makeInternalConversationFilter,
} from "./internalRecipients";

// Fixtures are real payloads pulled live from Willis (OznT3yyuwK3dqVXDsCaD)
// on 2026-07-21 via the ghl CLI. See docs/build-plans/internal-notifications-hidden.md
// section 1.1. Do not replace these with invented shapes.

const SINK_OWNER_PHONE = {
  id: "pEN4j1CmhzLkhkmucquh",
  source: "NOTIFICATION",
  phone: "+13134053227",
};

const SINK_OWNER_EMAIL = {
  id: "Gjn1WV1ifCtQurno2cDq",
  source: "NOTIFICATION",
  email: "williswindowashing@gmail.com",
};

// The staff sink. GHL calls this WEB_USER, not NOTIFICATION, which is why
// the source signal alone is not sufficient.
const SINK_STAFF = {
  id: "UissKT6okkBxdpJp87wK",
  source: "WEB_USER",
  phone: "+17343010570",
};

const REAL_LEAD_REPLIED = {
  id: "iu2cz52FIjqbCGjPmyvV",
  source: "Facebook",
  phone: "+17347654414",
  email: "sheryl@ncservo.com",
};

// A real lead who has not replied yet. Shape-identical to a sink under any
// "all outbound, never answered" heuristic. Guards that regression.
const REAL_LEAD_SILENT = {
  id: "9Jn53VC3tZgO0A6zFAbW",
  source: "Facebook",
  phone: "+12487617972",
};

const EMPTY = parseInternalRecipients("");

describe("normalizePhone", () => {
  it("reduces any formatting to the last 10 digits", () => {
    expect(normalizePhone("+17343010570")).toBe("7343010570");
    expect(normalizePhone("(734) 301-0570")).toBe("7343010570");
    expect(normalizePhone("734.301.0570")).toBe("7343010570");
    expect(normalizePhone("7343010570")).toBe("7343010570");
  });

  it("returns empty for anything shorter than 10 digits", () => {
    expect(normalizePhone("0570")).toBe("");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("not a phone")).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Willis@Example.COM ")).toBe("willis@example.com");
  });

  it("returns empty for non-strings and blanks", () => {
    expect(normalizeEmail("   ")).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(null)).toBe("");
  });
});

describe("parseInternalRecipients", () => {
  it("splits on commas and newlines and classifies by the @ sign", () => {
    const list = parseInternalRecipients(
      "+1 313 405 3227, williswindowashing@gmail.com\n(734) 301-0570",
    );
    expect(list.phones).toEqual(new Set(["3134053227", "7343010570"]));
    expect(list.emails).toEqual(new Set(["williswindowashing@gmail.com"]));
  });

  it("drops blank and whitespace-only entries", () => {
    const list = parseInternalRecipients(" , ,\n\n  ,");
    expect(list.phones.size).toBe(0);
    expect(list.emails.size).toBe(0);
  });

  it("drops phone entries that cannot yield 10 digits", () => {
    const list = parseInternalRecipients("1234, 7343010570");
    expect(list.phones).toEqual(new Set(["7343010570"]));
  });

  it("treats undefined config as an empty list", () => {
    const list = parseInternalRecipients(undefined);
    expect(list.phones.size).toBe(0);
    expect(list.emails.size).toBe(0);
  });
});

describe("isInternalRecipient", () => {
  describe("signal 1: contact.source === NOTIFICATION", () => {
    it("hides a NOTIFICATION contact even with no configured list", () => {
      expect(isInternalRecipient(SINK_OWNER_PHONE, EMPTY)).toBe(true);
      expect(isInternalRecipient(SINK_OWNER_EMAIL, EMPTY)).toBe(true);
    });

    it("matches the source case-insensitively", () => {
      expect(isInternalRecipient({ source: "notification" }, EMPTY)).toBe(true);
    });

    it("does not fire on a source that merely contains the word", () => {
      expect(
        isInternalRecipient({ source: "notification-form-lead" }, EMPTY),
      ).toBe(false);
    });
  });

  describe("signal 2: configured internal recipient list", () => {
    it("hides a staff contact by phone regardless of formatting", () => {
      const list = parseInternalRecipients("7343010570");
      expect(isInternalRecipient(SINK_STAFF, list)).toBe(true);
      expect(
        isInternalRecipient(SINK_STAFF, parseInternalRecipients("(734) 301-0570")),
      ).toBe(true);
    });

    it("hides a contact by email, case-insensitively", () => {
      const list = parseInternalRecipients("WillisWindowAshing@Gmail.com");
      expect(isInternalRecipient(SINK_OWNER_EMAIL, list)).toBe(true);
    });

    it("leaves the staff sink visible when the list is empty", () => {
      // Documents exactly why signal 1 alone is insufficient.
      expect(isInternalRecipient(SINK_STAFF, EMPTY)).toBe(false);
    });
  });

  describe("real leads stay visible", () => {
    it("keeps a lead who has replied", () => {
      expect(isInternalRecipient(REAL_LEAD_REPLIED, EMPTY)).toBe(false);
    });

    it("keeps a lead who has never replied", () => {
      expect(isInternalRecipient(REAL_LEAD_SILENT, EMPTY)).toBe(false);
    });

    it("keeps a lead when an unrelated recipient list is configured", () => {
      const list = parseInternalRecipients(
        "7343010570, williswindowashing@gmail.com",
      );
      expect(isInternalRecipient(REAL_LEAD_REPLIED, list)).toBe(false);
      expect(isInternalRecipient(REAL_LEAD_SILENT, list)).toBe(false);
    });
  });

  describe("fails open", () => {
    it("keeps a contact with no source, phone, or email", () => {
      expect(isInternalRecipient({}, EMPTY)).toBe(false);
    });


    it("does not match a contact whose phone is blank against a blank entry", () => {
      const list = parseInternalRecipients(" , ");
      expect(isInternalRecipient({ phone: "", email: "" }, list)).toBe(false);
      expect(isInternalRecipient({ phone: "abc" }, list)).toBe(false);
    });

    it("treats an undefined contact as visible", () => {
      expect(isInternalRecipient(undefined, EMPTY)).toBe(false);
    });
  });
});

describe("makeInternalConversationFilter", () => {
  const CONTACTS = [
    SINK_OWNER_PHONE,
    SINK_OWNER_EMAIL,
    SINK_STAFF,
    REAL_LEAD_REPLIED,
    REAL_LEAD_SILENT,
  ];

  // Conversation rows as GHL returns them: contactId plus denormalized
  // phone/email, but no `source`. The source signal must come from the roster.
  const CONV_SINK_OWNER = {
    contactId: "pEN4j1CmhzLkhkmucquh",
    phone: "+13134053227",
  };
  const CONV_SINK_STAFF = {
    contactId: "UissKT6okkBxdpJp87wK",
    phone: "+17343010570",
  };
  const CONV_REAL = {
    contactId: "iu2cz52FIjqbCGjPmyvV",
    phone: "+17347654414",
  };

  it("hides a NOTIFICATION conversation via the roster join", () => {
    const isInternal = makeInternalConversationFilter(CONTACTS, "");
    expect(isInternal(CONV_SINK_OWNER)).toBe(true);
    expect(isInternal(CONV_REAL)).toBe(false);
  });

  it("hides a staff conversation via the configured list", () => {
    const isInternal = makeInternalConversationFilter(CONTACTS, "7343010570");
    expect(isInternal(CONV_SINK_STAFF)).toBe(true);
  });

  it("falls back to the conversation's own phone when the roster misses", () => {
    // fetchAllContacts is page-capped, so a sink can be absent from the roster.
    // Without this fallback it would leak straight back into the inbox.
    const isInternal = makeInternalConversationFilter([], "3134053227");
    expect(isInternal(CONV_SINK_OWNER)).toBe(true);
  });

  it("keeps real leads when the roster misses entirely", () => {
    const isInternal = makeInternalConversationFilter([], "3134053227");
    expect(isInternal(CONV_REAL)).toBe(false);
  });

  it("keeps a conversation with no contactId", () => {
    const isInternal = makeInternalConversationFilter(CONTACTS, "");
    expect(isInternal({})).toBe(false);
  });
});
