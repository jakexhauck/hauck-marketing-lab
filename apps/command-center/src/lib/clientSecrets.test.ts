import { describe, it, expect } from "vitest";
import {
  CLIENT_SECRET_FIELDS,
  maskSecret,
  isBlank,
  normalizeField,
  validatePatch,
  viewRow,
} from "./clientSecrets";

describe("maskSecret", () => {
  it("never returns enough of a token to use it", () => {
    const token = "pit-abcdefghijklmnop-9x4Q";
    const masked = maskSecret(token);
    expect(masked).toBe("••••9x4Q");
    expect(masked).not.toContain("abcdefghijklmnop");
  });

  it("does not leak the length of a short secret", () => {
    expect(maskSecret("abcd")).toBe("••••");
    expect(maskSecret("a")).toBe("••••");
  });

  it("treats the read path's placeholders as not configured", () => {
    // Must agree with isPlaceholder in functions/lib/tenantGhl.ts, or the page
    // would show a client as connected while the backend refuses to use them.
    for (const v of ["", "  ", "pending", "PENDING", "env", null, undefined]) {
      expect(isBlank(v), `${v} should be blank`).toBe(true);
      expect(maskSecret(v)).toBeNull();
    }
  });
});

describe("normalizeField", () => {
  it("accepts a Meta ad account with or without the prefix", () => {
    expect(normalizeField("meta_ad_account_id", "act_123456")).toEqual({ ok: true, value: "act_123456" });
    // Pasted straight out of Meta's UI, which shows bare digits.
    expect(normalizeField("meta_ad_account_id", "123456")).toEqual({ ok: true, value: "act_123456" });
    expect(normalizeField("meta_ad_account_id", "  act_123456 ")).toEqual({ ok: true, value: "act_123456" });
  });

  it("rejects an ad account that is not numeric", () => {
    const r = normalizeField("meta_ad_account_id", "act_not-a-number");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/digits/i);
  });

  it("strips the properties/ prefix GA4 shows in its own UI", () => {
    expect(normalizeField("ga4_property_id", "properties/987654")).toEqual({ ok: true, value: "987654" });
    expect(normalizeField("ga4_property_id", "987654")).toEqual({ ok: true, value: "987654" });
    expect(normalizeField("ga4_property_id", "G-ABC123").ok).toBe(false);
  });

  it("rejects a GHL token with whitespace or an obviously truncated paste", () => {
    expect(normalizeField("ghl_token", "pit-abc def").ok).toBe(false);
    expect(normalizeField("ghl_token", "short").ok).toBe(false);
    expect(normalizeField("ghl_token", "pit-abcdefghijklmnopqrstuv").ok).toBe(true);
  });

  it("validates a location id against the real GHL shape", () => {
    expect(normalizeField("ghl_location_id", "OznT3yyuwK3dqVXDsCaD").ok).toBe(true);
    expect(normalizeField("ghl_location_id", "r0WfsA12qpBv7M185V3v").ok).toBe(true);
    expect(normalizeField("ghl_location_id", "too-short").ok).toBe(false);
  });

  it("allows an explicit clear on every field", () => {
    // Disconnecting a client is a real action, not an error.
    for (const f of CLIENT_SECRET_FIELDS) {
      expect(normalizeField(f.column, "  "), `${f.column} should clear`).toEqual({ ok: true, value: "" });
    }
  });

  it("refuses a column that is not on the list", () => {
    expect(normalizeField("supabase_service_role_key", "x").ok).toBe(false);
  });
});

describe("validatePatch", () => {
  it("only touches the fields actually sent", () => {
    const r = validatePatch({ ghl_token: "pit-abcdefghijklmnopqrstuv" });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.patch)).toEqual(["ghl_token"]);
  });

  it("silently drops a column outside the allow-list", () => {
    // A stale tab or a crafted request must not be able to write any column it
    // likes into the tenants row.
    const r = validatePatch({ ghl_token: "pit-abcdefghijklmnopqrstuv", slug: "hijacked", id: "other" });
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ ghl_token: "pit-abcdefghijklmnopqrstuv" });
    expect(r.patch.slug).toBeUndefined();
  });

  it("reports per-field errors and fails the whole patch", () => {
    const r = validatePatch({ meta_ad_account_id: "nope", ga4_property_id: "123" });
    expect(r.ok).toBe(false);
    expect(r.errors.meta_ad_account_id).toBeTruthy();
    // A good field alongside a bad one is still parsed, so the form can show
    // exactly which input to fix.
    expect(r.patch.ga4_property_id).toBe("123");
  });

  it("rejects a non-object body", () => {
    expect(validatePatch(null).ok).toBe(false);
    expect(validatePatch("string").ok).toBe(false);
  });
});

describe("viewRow", () => {
  it("masks secrets and shows ids in full", () => {
    const view = viewRow({
      ghl_token: "pit-abcdefghijklmnop-9x4Q",
      ghl_location_id: "OznT3yyuwK3dqVXDsCaD",
      meta_ad_account_id: "act_123",
      ga4_property_id: null,
      google_place_id: "pending",
    });
    const by = Object.fromEntries(view.map((v) => [v.column, v]));

    expect(by.ghl_token.display).toBe("••••9x4Q");
    expect(by.ghl_token.configured).toBe(true);
    // Ids are not secrets: hiding them would make it impossible to check them
    // against the vendor dashboard.
    expect(by.ghl_location_id.display).toBe("OznT3yyuwK3dqVXDsCaD");
    expect(by.ga4_property_id.configured).toBe(false);
    expect(by.google_place_id.configured).toBe(false);
  });

  it("never puts a raw secret anywhere in its output", () => {
    const token = "pit-supersecrettokenvalue";
    const json = JSON.stringify(viewRow({ ghl_token: token }));
    expect(json).not.toContain("supersecret");
  });
});
