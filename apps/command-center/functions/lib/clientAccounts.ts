import { resolveBoardPipeline } from "./leadBoard";
import { pickEstimateCalendars } from "./estimateTracking";

// Client > Accounts: one row per thing a client needs connected, each green or
// red. Pure, so every rule is tested without GHL or Supabase; the endpoint in
// api/admin/clients/[tenantId]/accounts.ts gathers the raw facts.
//
// Every GHL check matches by NAME, the same way the app itself finds the
// pipeline and calendars, so a green here means the app will find it too.

export type AccountCheckId =
  | "ghl"
  | "texting"
  | "meta-ads"
  | "meta-page"
  | "pipeline"
  | "calendars"
  | "owner-links"
  | "owner-phone"
  | "login"
  | "push";

// ok = connected. missing = red, fix it. blocked = needs GHL linked first.
// unknown = GHL would not answer, so it could not be checked.
export type CheckState = "ok" | "missing" | "blocked" | "unknown";

export interface AccountCheck {
  id: AccountCheckId;
  state: CheckState;
  // Short fact for a red row ("Missing: Job"). Empty when green.
  detail: string;
}

const ok = (id: AccountCheckId): AccountCheck => ({ id, state: "ok", detail: "" });
const missing = (id: AccountCheckId, detail: string): AccountCheck => ({ id, state: "missing", detail });

function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

interface RawPipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string; position?: number; color?: string }[];
}

export function pipelineCheck(pipelines: RawPipeline[]): AccountCheck {
  const board = resolveBoardPipeline(pipelines);
  if (!board) return missing("pipeline", "No Sales Pipeline");
  if (!board.stages.some((s) => s.key === "noAnswer")) return missing("pipeline", "No Answer stage missing");
  return ok("pipeline");
}

interface RawCalendar {
  id: string;
  name?: string;
  isActive?: boolean;
  teamMembers?: unknown[];
}

// Home Estimate and Job, found the way booking finds them. (The Conversion
// Asset Calendar went with conversion assets, 2026-10-20.)
export function calendarsCheck(calendars: RawCalendar[]): AccountCheck {
  const picked = pickEstimateCalendars(calendars);
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const wanted: [string, RawCalendar | null | undefined][] = [
    ["Home Estimate", picked ? byId.get(picked.estimate.id) : null],
    ["Job", picked?.job ? byId.get(picked.job.id) : null],
  ];
  const absent = wanted.filter(([, c]) => !c).map(([n]) => n);
  if (absent.length) return missing("calendars", `Missing: ${absent.join(", ")}`);
  const empty = wanted.filter(([, c]) => !(c?.teamMembers?.length)).map(([n]) => n);
  if (empty.length) return missing("calendars", `No team member: ${empty.join(", ")}`);
  return ok("calendars");
}

export function ownerLinksCheck(
  existing: { name: string; value?: string }[],
  expected: { name: string; value: string }[],
): AccountCheck {
  const byName = new Map(existing.map((v) => [norm(v.name), String(v.value ?? "").trim()]));
  const absent = expected.filter((e) => !byName.has(norm(e.name))).map((e) => e.name);
  if (absent.length) return missing("owner-links", `Missing: ${absent.join(", ")}`);
  const wrong = expected.filter((e) => byName.get(norm(e.name)) !== e.value).map((e) => e.name);
  if (wrong.length) return missing("owner-links", `Wrong: ${wrong.join(", ")}`);
  return ok("owner-links");
}

export function ownerPhoneCheck(users: { phone?: unknown }[]): AccountCheck {
  if (users.length === 0) return missing("owner-phone", "No users");
  if (!users.some((u) => String(u.phone ?? "").replace(/\D/g, "").length >= 10)) {
    return missing("owner-phone", "No user has a phone");
  }
  return ok("owner-phone");
}

// What the endpoint knows about the client before any GHL call.
export interface AccountFacts {
  // stale = on the app, but the agency install was approved before the app
  // asked for a scope it now needs (lib/ghlApp.ts missingScopes).
  ghl: "app" | "stale" | "token" | "none" | "dead";
  metaAdAccountId: string | null;
  metaPageId: string | null;
  hasLogin: boolean;
  pushDevices: number;
}

// The rows that need nothing from GHL, plus the link itself.
export function baseChecks(f: AccountFacts): AccountCheck[] {
  const ghl =
    f.ghl === "app"
      ? ok("ghl")
      : f.ghl === "stale"
        ? missing("ghl", "Reinstall the app: missing permissions")
        : f.ghl === "token"
          ? missing("ghl", "Old token, not the Marketplace app")
          : f.ghl === "dead"
            ? missing("ghl", "Linked, but GHL refused the key")
            : missing("ghl", "Not linked");
  return [
    ghl,
    (f.metaAdAccountId ?? "").trim() ? ok("meta-ads") : missing("meta-ads", "Not connected"),
    (f.metaPageId ?? "").trim() ? ok("meta-page") : missing("meta-page", "Not picked"),
    f.hasLogin ? ok("login") : missing("login", "No owner login"),
    f.pushDevices > 0 ? ok("push") : missing("push", "No phone turned on"),
  ];
}

// Whether this client's key may send a text, from an empty send to GHL (see
// clientAccountsRun.ts). GHL checks the key's scopes before the body, so the
// empty message is refused on its contents only once the key is allowed to
// send, and nothing can go out. Added 2026-10-26: every app-linked client's
// texts 401'd while the GHL row read green, because reads worked and nothing
// ever tried a write.
export function textingCheck(probe: { status: number; body: string } | null): AccountCheck {
  if (!probe || probe.status >= 500 || probe.status === 429) {
    return { id: "texting", state: "unknown", detail: "GHL did not answer" };
  }
  if (probe.status === 401 && /scope/i.test(probe.body)) return missing("texting", "Missing send permission");
  if (probe.status === 401 || probe.status === 403) return missing("texting", "GHL refused the send");
  return ok("texting");
}

// The GHL rows when there is no working key to read them with.
export function blockedGhlChecks(): AccountCheck[] {
  return (["texting", "pipeline", "calendars", "owner-links", "owner-phone"] as const).map((id) => ({
    id,
    state: "blocked",
    detail: "Link GHL first",
  }));
}

// Display order on the page.
export const CHECK_ORDER: AccountCheckId[] = [
  "ghl",
  "texting",
  "meta-ads",
  "meta-page",
  "pipeline",
  "calendars",
  "owner-links",
  "owner-phone",
  "login",
  "push",
];

export function sortChecks(checks: AccountCheck[]): AccountCheck[] {
  return [...checks].sort((a, b) => CHECK_ORDER.indexOf(a.id) - CHECK_ORDER.indexOf(b.id));
}
