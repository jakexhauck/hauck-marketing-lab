import { describe, expect, it } from "vitest";
import { APP_SCOPES, missingScopes } from "./ghlApp";

describe("missingScopes", () => {
  it("lists what the saved install was not granted", () => {
    const old = APP_SCOPES.filter((s) => s !== "forms.readonly" && s !== "calendars/events.write").join(" ");
    expect(missingScopes(old)).toEqual(["calendars/events.write", "forms.readonly"]);
  });

  it("is empty when every scope is granted, and full when none are", () => {
    expect(missingScopes(APP_SCOPES.join(" "))).toEqual([]);
    expect(missingScopes(null)).toEqual([...APP_SCOPES]);
  });
});
