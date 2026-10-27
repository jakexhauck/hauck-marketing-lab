import { describe, expect, it } from "vitest";
import { APP_SCOPES, installUrl, missingScopes } from "./ghlApp";
import type { Env } from "./env";

describe("APP_SCOPES", () => {
  // Full GHL access for the Grok Bots (2026-10-27): every scope ticked on the
  // app in the developer portal. Shrinking this silently takes access away.
  it("asks for all 168 scopes ticked in the portal, each once", () => {
    expect(APP_SCOPES).toHaveLength(168);
    expect(new Set(APP_SCOPES).size).toBe(168);
    for (const s of ["workflows.readonly", "funnels/funnel.readonly", "objects/record.write", "snapshots.readonly", "oauth.write"]) {
      expect(APP_SCOPES).toContain(s);
    }
  });

  it("still fits in an install link", () => {
    const url = installUrl({ GHL_APP_CLIENT_ID: "client-id" } as Env, "https://app.hauckmarketing.com");
    expect(url).toContain("objects%2Frecord.write");
    expect(url!.length).toBeLessThan(8000);
  });
});

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
