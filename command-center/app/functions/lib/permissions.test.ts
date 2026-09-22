import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  checkStaffAccess,
  sanitizeGrants,
  type EffectivePermissions,
} from "./permissions";
import { CAPABILITIES as FRONTEND_CAPABILITIES } from "../../src/lib/capabilities";

const view = (...caps: string[]): EffectivePermissions =>
  Object.fromEntries(caps.map((c) => [c, { view: true, edit: false }]));

describe("page capabilities", () => {
  it("backend and frontend registries match", () => {
    const strip = (list: { key: string; label: string; hasEdit: boolean; retired?: boolean }[]) =>
      list.map((c) => [c.key, c.label, c.hasEdit, Boolean(c.retired)]);
    expect(strip(CAPABILITIES)).toEqual(strip(FRONTEND_CAPABILITIES));
  });

  it("each ads page reads only with its own grant", () => {
    expect(checkStaffAccess("/api/ads/meta-data", "GET", view("paid_ads")).allowed).toBe(false);
    expect(checkStaffAccess("/api/ads/meta-data", "GET", view("meta_data")).allowed).toBe(true);
    expect(checkStaffAccess("/api/ads/creatives-folder", "GET", view("ads_dashboard")).allowed).toBe(false);
    expect(checkStaffAccess("/api/ads/creatives-folder", "GET", view("creatives")).allowed).toBe(true);
  });

  it("the tracker feed opens for Lead Tracker or Ads Dashboard", () => {
    const path = "/api/ads/tracker";
    expect(checkStaffAccess(path, "GET", view("paid_ads")).allowed).toBe(true);
    expect(checkStaffAccess(path, "GET", view("ads_dashboard")).allowed).toBe(true);
    expect(checkStaffAccess(path, "GET", view("inbox")).allowed).toBe(false);
  });

  it("organic needs the organic grant, detail included", () => {
    expect(checkStaffAccess("/api/organic", "GET", view("inbox")).allowed).toBe(false);
    expect(checkStaffAccess("/api/organic/abc", "GET", view("organic")).allowed).toBe(true);
  });

  it("the notification bell is open to every signed-in employee", () => {
    expect(checkStaffAccess("/api/notifications", "GET", {}).allowed).toBe(true);
    expect(checkStaffAccess("/api/notifications/read", "POST", {}).allowed).toBe(true);
  });

  it("drops grants for pages the client does not have", () => {
    const rows = sanitizeGrants(
      [
        { capability: "creatives", view: true },
        { capability: "organic", view: true },
      ],
      ["creatives"],
    );
    expect(rows.map((r) => r.capability)).toEqual(["creatives"]);
  });
});
