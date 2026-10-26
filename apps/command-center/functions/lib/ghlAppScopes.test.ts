import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_SCOPES, GHL_AREA_SCOPES, missingScopes } from "./ghlApp";

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

// The top-level areas of the GHL v2 API. A string literal starting with one of
// these is a GHL call; everything the app serves itself sits under /api.
const GHL_ROOTS = [
  "agent-studio", "associations", "blogs", "businesses", "calendars", "campaigns", "companies", "contacts",
  "conversation-ai", "conversations", "courses", "custom-fields", "custom-menus", "emails", "forms", "funnels",
  "invoices", "knowledge-bases", "links", "locations", "marketplace", "medias", "oauth", "objects",
  "opportunities", "payments", "phone-system", "products", "proposals", "saas", "snapshots",
  "social-media-posting", "store", "surveys", "users", "voice-ai", "workflows",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("GHL_AREA_SCOPES", () => {
  const root = join(__dirname, "..");
  const pathRe = new RegExp(`["'\`](?:https://services\\.leadconnectorhq\\.com)?/(${GHL_ROOTS.join("|")})(?=[/?"'\`])`, "g");
  const used = new Map<string, string>();
  for (const file of sourceFiles(root)) {
    for (const m of readFileSync(file, "utf8").matchAll(pathRe)) {
      if (!used.has(m[1])) used.set(m[1], file);
    }
  }

  it("finds the GHL calls it is meant to police", () => {
    expect([...used.keys()]).toEqual(expect.arrayContaining(["contacts", "conversations", "calendars"]));
  });

  it("has an entry for every GHL area the server calls", () => {
    const unmapped = [...used.entries()].filter(([area]) => !GHL_AREA_SCOPES[area]).map(([a, f]) => `${a} (${f})`);
    expect(unmapped).toEqual([]);
  });

  it("asks the install for every scope those areas need", () => {
    const asked = new Set<string>(APP_SCOPES);
    const missing = Object.values(GHL_AREA_SCOPES).flat().filter((s) => !asked.has(s));
    expect(missing).toEqual([]);
  });
});
