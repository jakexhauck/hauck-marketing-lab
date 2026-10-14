import { describe, it, expect } from "vitest";
import { effectiveFields, formatUsPhone, pickGhlNumber } from "./customValuesSheet";

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
