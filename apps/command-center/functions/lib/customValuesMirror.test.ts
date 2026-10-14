import { describe, expect, it } from "vitest";
import { isAppValue, parseValueBody, shapeValues } from "./customValuesMirror";

describe("shapeValues", () => {
  it("sorts by name and keeps GHL's merge key", () => {
    const out = shapeValues([
      { id: "2", name: "zip", value: "48197", fieldKey: "{{ custom_values.zip }}" },
      { id: "1", name: "Open Lead", value: "https://x" },
      { name: "no id" },
    ]);
    expect(out.map((v) => v.id)).toEqual(["1", "2"]);
    expect(out[0].merge).toBe("{{custom_values.open_lead}}");
    expect(out[1].merge).toBe("{{ custom_values.zip }}");
    expect(out.map((v) => v.locked)).toEqual([true, false]);
  });
});

describe("isAppValue", () => {
  it("locks Open Lead whatever the case", () => {
    expect(isAppValue(" open lead ")).toBe(true);
    expect(isAppValue("Open Lead 2")).toBe(false);
  });
});

describe("parseValueBody", () => {
  it("needs a name", () => {
    expect(parseValueBody({ name: "  ", value: "x" })).toBeNull();
    expect(parseValueBody(null)).toBeNull();
  });
  it("trims the name, keeps the value as typed", () => {
    expect(parseValueBody({ name: " Phone ", value: " 555 " })).toEqual({ name: "Phone", value: " 555 " });
  });
});
