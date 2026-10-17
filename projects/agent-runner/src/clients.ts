// Which vault folder and which Drive folder belong to which client.
//
// The app only knows a tenant's slug and name; the vault folders were named by
// hand, before there was an app, so the two do not line up on their own
// (Made Better is "made-better-landscaping-co" in the app and "Made Better LC"
// in the vault). This is the one place that joins them.
//
// Slugs, and how sure we are of each (2026-10-17):
//   willis-windows              confirmed: seeded in migrations and tests
//   made-better-landscaping-co  confirmed: seeded in migrations and tests
//   above-all-garage-doors      likely: public/sites/<slug>/ folders are named
//                               by the tenant slug, not checked against the DB
//   clear-choice-windows        likely, the same way
//
// A client missing from the map still works: its folder is named after the
// tenant and is created with its first lesson.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ClaimTenant } from "./wire.ts";

type TenantRef = Pick<ClaimTenant, "slug" | "name">;

export const VAULT_FOLDERS: Record<string, string> = {
  "willis-windows": "Willis Windows",
  "made-better-landscaping-co": "Made Better LC",
  "above-all-garage-doors": "Above All Garage Doors",
  "clear-choice-windows": "Clear Choice Windows",
};

// Only where the Drive folder is not named like the vault folder. Clear
// Choice's Drive folder is "Clear Choice Owensboro".
export const DRIVE_NAMES: Record<string, string> = {
  "clear-choice-windows": "Clear Choice Owensboro",
};

// Windows will not take these in a folder name, and the vault is on Windows.
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
}

export function vaultFolder(t: TenantRef): string {
  return VAULT_FOLDERS[t.slug] ?? safeName(t.name);
}

export function tenantForFolder<T extends TenantRef>(folder: string, tenants: T[]): T | null {
  return tenants.find((t) => vaultFolder(t) === folder) ?? null;
}

// Drive names a client folder "<handshake> | Name", and the G: mount shows the
// pipe as spaces, so compare on what is left after the leading emoji and any
// spaces or pipes. Returns null when the folder is not there: the agent then
// simply gets no Drive access rather than a path that does not exist.
function bareName(dir: string): string {
  return dir.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();
}

export function findDriveFolder(root: string, t: TenantRef): string | null {
  const want = (DRIVE_NAMES[t.slug] ?? vaultFolder(t)).toLowerCase();
  if (!existsSync(root)) return null;
  for (const name of readdirSync(root)) {
    if (bareName(name) !== want) continue;
    const full = join(root, name);
    if (statSync(full).isDirectory()) return full;
  }
  return null;
}
