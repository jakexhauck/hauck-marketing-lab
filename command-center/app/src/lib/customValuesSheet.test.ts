import { describe, it, expect } from "vitest";
import { buildSheet, effectiveFields, formatUsPhone, pickGhlNumber } from "./customValuesSheet";

const live = [
  { id: "1", name: "Company Name", value: "Willis Windows" },
  { id: "2", name: "Company Phone Number", value: "(555) 000-0000" },
  { id: "3", name: "user first name", value: "" },
  { id: "4", name: "Location API Token", value: "pit-secret-123" },
];

describe("formatUsPhone", () => {
  it("formats a US E.164 number", () => {
    expect(formatUsPhone("+13137662171")).toBe("(313) 766-2171");
  });
  it("leaves anything else alone", () => {
    expect(formatUsPhone("+447700900123")).toBe("+447700900123");
    expect(formatUsPhone("")).toBe("");
  });
});

describe("pickGhlNumber", () => {
  it("prefers the default number", () => {
    expect(
      pickGhlNumber([
        { phoneNumber: "+13130000000", isDefaultNumber: false },
        { phoneNumber: "+13137662171", isDefaultNumber: true },
      ]),
    ).toBe("(313) 766-2171");
  });
  it("falls back to the first, and null for none", () => {
    expect(pickGhlNumber([{ phoneNumber: "+13130000000" }])).toBe("(313) 000-0000");
    expect(pickGhlNumber([])).toBeNull();
  });
});

describe("effectiveFields", () => {
  it("uses the GHL number as Company Phone Number when there is one", () => {
    expect(effectiveFields({ company_phone: "(248) 111-2222" }, "(313) 766-2171").company_phone).toBe(
      "(313) 766-2171",
    );
  });
  it("keeps the typed phone when GHL has no number", () => {
    expect(effectiveFields({ company_phone: "(248) 111-2222" }, null).company_phone).toBe("(248) 111-2222");
  });
});

describe("buildSheet", () => {
  const sheet = buildSheet({
    fields: { company_name: "Willis Windows", company_phone: "(248) 111-2222", user_first_name: "Chris" },
    live,
    ghlNumber: "(313) 766-2171",
    linked: true,
  });
  const row = (key: string) => sheet.groups.flatMap((g) => g.rows).find((r) => r.key === key)!;

  it("marks a value that matches GHL", () => {
    expect(row("company_name").state).toBe("match");
  });

  it("marks a value that differs from GHL", () => {
    expect(row("company_phone")).toMatchObject({
      appValue: "(313) 766-2171",
      ghlValue: "(555) 000-0000",
      state: "differs",
    });
  });

  it("marks a value GHL has blank as differs", () => {
    expect(row("user_first_name")).toMatchObject({ ghlValue: "", state: "differs" });
  });

  it("marks a custom value the sub-account does not have", () => {
    expect(row("from_name").state).toBe("missing-in-ghl");
  });

  it("marks an empty app value with nothing in GHL as empty", () => {
    const s = buildSheet({ fields: {}, live: [{ id: "x", name: "From Name", value: "" }], ghlNumber: null, linked: true });
    expect(s.groups.flatMap((g) => g.rows).find((r) => r.key === "from_name")!.state).toBe("empty");
  });

  it("never returns the token, only whether it is set", () => {
    expect(sheet.token).toBe("set");
    expect(JSON.stringify(sheet)).not.toContain("pit-secret-123");
  });

  it("leaves out the connection fields", () => {
    expect(sheet.groups.flatMap((g) => g.rows).some((r) => r.key === "ghl_token")).toBe(false);
  });

  it("reads every GHL value as unknown when the sub-account is not linked", () => {
    const s = buildSheet({ fields: { company_name: "Willis Windows" }, live: [], ghlNumber: null, linked: false });
    expect(s.token).toBe("unknown");
    expect(s.groups.flatMap((g) => g.rows).find((r) => r.key === "company_name")).toMatchObject({
      ghlValue: null,
      state: "unknown",
    });
  });
});
