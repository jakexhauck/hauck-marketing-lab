import { describe, it, expect } from "vitest";
// Read the Env interface as text (the ?raw convention already used by
// softwareMap.test.ts) so the guard below cannot be satisfied by a stale copy.
import envSource from "../../functions/lib/env.ts?raw";
import {
  CONNECTIONS,
  credentialIndex,
  requiredCredentials,
  surfaceIndex,
} from "./connectionRegistry";

// Config values that are deliberately NOT credentials: they change behaviour but
// there is nothing to connect, expire, or hunt for. Anything else added to the
// Env interface has to be declared in the registry, which is what makes the
// control room trustworthy rather than a snapshot that quietly goes stale.
const NON_CREDENTIALS = new Set([
  "TENANT_SLUG",
  "TEST_TENANT_SLUG",
  "TENANT_TIMEZONE",
  "INTERNAL_RECIPIENTS",
  "KV_CACHE",
  // Which Doppler project to read, not a credential for reaching it.
  // Which timezone agency bookings display in, not a credential.
  "AGENCY_TIMEZONE",
  "DOPPLER_PROJECT",
  "DOPPLER_CONFIG",
  // An override list of calendar ids, not a credential: absent is the normal
  // case and the sync falls back to matching calendars by name. Nothing here
  // expires or needs reissuing, so a red row for it would be a lie.
  "AGENCY_SALES_CALENDAR_IDS",
  // The intake funnel's published domain. A public address that decides which
  // origin CORS lets through, not a secret: there is nothing to reissue and
  // nothing that expires. Absent simply means the funnel is not published yet.
  "FUNNEL_URL",
  // Which calendar the onboarding call lands on. An id, not a credential: the
  // GHL token that reaches it is AGENCY_GHL_TOKEN, which is declared. Unset
  // falls back to the calendar the intake funnel already books.
  "ONBOARDING_CALENDAR_ID",
]);

function envInterfaceKeys(): string[] {
  const start = envSource.indexOf("export interface Env {");
  const end = envSource.indexOf("\n}", start);
  const body = envSource.slice(start, end);
  // Matches `NAME?: type;` / `NAME: type;` at the start of a line, skipping the
  // comment blocks that document each key.
  return [...body.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\??:/gm)].map((m) => m[1]);
}

describe("connection registry", () => {
  it("declares every credential in the Env interface", () => {
    const declared = new Set(credentialIndex().map((c) => c.name));
    const missing = envInterfaceKeys().filter(
      (k) => !NON_CREDENTIALS.has(k) && !declared.has(k),
    );
    expect(missing).toEqual([]);
  });

  it("gives every connection a probe id, a purpose, and a way out", () => {
    for (const def of CONNECTIONS) {
      expect(def.id, `${def.label} needs an id`).toMatch(/^[a-z0-9-]+$/);
      expect(def.purpose.length, `${def.label} needs a purpose`).toBeGreaterThan(20);
      expect(def.remediation.length, `${def.label} needs remediation`).toBeGreaterThan(20);
      expect(requiredCredentials(def).length, `${def.label} needs a credential`).toBeGreaterThan(0);
      expect(def.surfaces.length, `${def.label} needs at least one surface`).toBeGreaterThan(0);
    }
  });

  it("uses unique connection ids", () => {
    const ids = CONNECTIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds a reverse index from surface back to its requirements", () => {
    const groups = surfaceIndex();
    const jobs = groups.find((g) => g.surface.label === "Jobs calendar");
    expect(jobs?.requires.map((d) => d.id)).toContain("composio-calendar");

    // The point of the reverse view: a surface fed by more than one integration
    // names all of them, so "why is this empty" has one place to be answered.
    // Push alerts need the webhook to fire AND the push keys to deliver, and a
    // failure in either looks identical from the outside.
    const push = groups.find((g) => g.surface.label === "New lead push alerts");
    expect(push?.requires.map((d) => d.id).sort()).toEqual(["ghl-webhook", "web-push"]);
  });

  it("never claims a credential is in Doppler when we hold it ourselves", () => {
    // Tokens we captured via OAuth, or that a vendor holds, cannot be mirrored
    // from Doppler. Marking one as inDoppler would send me to the wrong place.
    for (const c of credentialIndex()) {
      if (c.home === "supabase-table" || c.home === "composio" || c.home === "tenant-row") {
        expect(c.inDoppler, `${c.name} cannot live in Doppler`).toBeFalsy();
      }
    }
  });
});
