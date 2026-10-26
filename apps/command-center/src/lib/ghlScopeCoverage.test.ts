import { describe, expect, it } from "vitest";
import { APP_SCOPES, GHL_AREA_SCOPES } from "../../functions/lib/ghlScopes";

// Every GHL API area the server calls must have its scopes in APP_SCOPES, or
// the install never grants them and the call 401s on every app-linked client
// (2026-10-26: texting). Lives in src/ because ?raw globbing needs Vite's types,
// which the Workers tsconfig in functions/ does not carry.
const SOURCES = import.meta.glob(["../../functions/**/*.ts", "!../../functions/**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The top-level areas of the GHL v2 API. A string literal starting with one of
// these is a GHL call; everything the app serves itself sits under /api.
const GHL_ROOTS = [
  "agent-studio", "associations", "blogs", "businesses", "calendars", "campaigns", "companies", "contacts",
  "conversation-ai", "conversations", "courses", "custom-fields", "custom-menus", "emails", "forms", "funnels",
  "invoices", "knowledge-bases", "links", "locations", "marketplace", "medias", "oauth", "objects",
  "opportunities", "payments", "phone-system", "products", "proposals", "saas", "snapshots",
  "social-media-posting", "store", "surveys", "users", "voice-ai", "workflows",
];

describe("GHL_AREA_SCOPES", () => {
  const pathRe = new RegExp(`["'\`](?:https://services\\.leadconnectorhq\\.com)?/(${GHL_ROOTS.join("|")})(?=[/?"'\`])`, "g");
  const used = new Map<string, string>();
  for (const [file, text] of Object.entries(SOURCES)) {
    for (const m of text.matchAll(pathRe)) {
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
