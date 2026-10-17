import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findDriveFolder, tenantForFolder, vaultFolder } from "../src/clients.ts";

const t = (slug: string, name: string) => ({ id: `id-${slug}`, slug, name, metaAdAccountId: null });

describe("clients", () => {
  it("maps known slugs to their vault folder", () => {
    expect(vaultFolder(t("willis-windows", "Willis Windows LLC"))).toBe("Willis Windows");
    expect(vaultFolder(t("made-better-landscaping-co", "Made Better Landscaping Co"))).toBe("Made Better LC");
  });

  it("names an unmapped client's folder after the tenant, safe for Windows", () => {
    expect(vaultFolder(t("new-one", "Acme / Sons: HVAC"))).toBe("Acme - Sons- HVAC");
  });

  it("finds a tenant by its vault folder", () => {
    const list = [t("willis-windows", "Willis"), t("x", "X Co")];
    expect(tenantForFolder("Willis Windows", list)?.id).toBe("id-willis-windows");
    expect(tenantForFolder("X Co", list)?.id).toBe("id-x");
    expect(tenantForFolder("Nobody", list)).toBeNull();
  });

  it("finds the Drive folder whatever sits between the handshake and the name", () => {
    const root = mkdtempSync(join(tmpdir(), "drive-"));
    mkdirSync(join(root, "\u{1F91D}   Willis Windows"));
    mkdirSync(join(root, "\u{1F91D} - Made Better LC"));
    expect(findDriveFolder(root, t("willis-windows", "Willis"))).toBe(join(root, "\u{1F91D}   Willis Windows"));
    expect(findDriveFolder(root, t("made-better-landscaping-co", "MB"))).toBe(join(root, "\u{1F91D} - Made Better LC"));
    expect(findDriveFolder(root, t("nope", "Nope"))).toBeNull();
    expect(findDriveFolder(join(root, "missing"), t("nope", "Nope"))).toBeNull();
  });
});
