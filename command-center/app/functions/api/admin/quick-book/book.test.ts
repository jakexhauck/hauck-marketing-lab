import { describe, it, expect } from "vitest";
import { validateQuickBook, buildContactPayload, type QuickBookBody } from "./book";

const base: QuickBookBody = {
  tenantId: "t1",
  calendarId: "cal1",
  contact: { firstName: "Dana", lastName: "Kowalski", phone: "+15125550143", email: "" },
  answers: {},
  startTime: "2026-09-23T10:00:00-04:00",
  endTime: "2026-09-23T11:00:00-04:00",
};

describe("validateQuickBook", () => {
  it("accepts a complete new-prospect booking", () => {
    expect(validateQuickBook(base)).toEqual({ ok: true });
  });

  it("accepts an existing contact with only an id", () => {
    expect(validateQuickBook({ ...base, contactId: "c1", contact: {} })).toEqual({ ok: true });
  });

  it.each([
    ["tenantId", { tenantId: "" }, "missing_tenant_id"],
    ["calendarId", { calendarId: " " }, "missing_calendar_id"],
    ["time range", { endTime: "" }, "missing_time_range"],
    ["first name", { contact: { firstName: "", phone: "+15125550143" } }, "missing_name"],
    ["phone on a new prospect", { contact: { firstName: "Dana", phone: "" } }, "missing_phone"],
  ])("rejects a missing %s", (_n, patch, code) => {
    const r = validateQuickBook({ ...base, ...(patch as Partial<QuickBookBody>) });
    expect(r).toEqual({ ok: false, code });
  });

  it("rejects an end before the start", () => {
    const r = validateQuickBook({ ...base, endTime: "2026-09-23T09:00:00-04:00" });
    expect(r).toEqual({ ok: false, code: "bad_time_range" });
  });
});

describe("buildContactPayload", () => {
  it("leaves an existing contact's name, phone and email as GHL holds them", () => {
    const p = buildContactPayload(
      { ...base, contactId: "c1", contact: { firstName: "+15125550143", phone: "+15125550143" } },
      [],
      "America/Detroit",
    );
    expect(p).toEqual({ timezone: "America/Detroit" });
  });

  const fields = [
    { key: "address", custom: false },
    { key: "postal_code", custom: false },
    { key: "Fi3SrCzg5d5YpDzcaRrA", custom: true },
  ];

  it("maps standard answers onto GHL's contact keys", () => {
    const p = buildContactPayload(
      { ...base, answers: { address: "4417 Ridgeview Dr", postal_code: "48201" } },
      fields,
      "America/Detroit",
    );
    expect(p).toMatchObject({
      firstName: "Dana",
      lastName: "Kowalski",
      phone: "+15125550143",
      address1: "4417 Ridgeview Dr",
      postalCode: "48201",
      timezone: "America/Detroit",
    });
  });

  it("writes custom answers as customFields by id", () => {
    const p = buildContactPayload(
      { ...base, answers: { Fi3SrCzg5d5YpDzcaRrA: "12 windows, 2-story" } },
      fields,
      "America/Detroit",
    );
    expect(p.customFields).toEqual([{ id: "Fi3SrCzg5d5YpDzcaRrA", field_value: "12 windows, 2-story" }]);
  });

  it("never sends a blank, so it cannot wipe what GHL already holds", () => {
    const p = buildContactPayload(
      { ...base, answers: { address: "  ", Fi3SrCzg5d5YpDzcaRrA: "" } },
      fields,
      "America/Detroit",
    );
    expect(p).not.toHaveProperty("address1");
    expect(p).not.toHaveProperty("email");
    expect(p).not.toHaveProperty("customFields");
  });

  it("ignores an answer for a key the form never asked", () => {
    const p = buildContactPayload(
      { ...base, answers: { dnd: "true", tags: "vip" } },
      fields,
      "America/Detroit",
    );
    expect(p).not.toHaveProperty("dnd");
    expect(p).not.toHaveProperty("tags");
    expect(p).not.toHaveProperty("customFields");
  });
});
