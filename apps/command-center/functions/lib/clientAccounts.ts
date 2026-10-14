import { resolveBoardPipeline } from "./leadBoard";
import { pickEstimateCalendars } from "./estimateTracking";
import { CONVERSION_ASSET_CALENDAR } from "./conversionAssets";

// Client > Accounts: one row per thing a client needs connected, each green or
// red. Pure, so every rule is tested without GHL or Supabase; the endpoint in
// api/admin/clients/[tenantId]/accounts.ts gathers the raw facts.
//
// Every GHL check matches by NAME, the same way the app itself finds the
// pipeline and calendars, so a green here means the app will find it too.

export type AccountCheckId =
  | "ghl"
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

// Home Estimate and Job are found the way booking finds them; Conversion Asset
// Calendar by its exact name, the way the conversion assets embed it.
export function calendarsCheck(calendars: RawCalendar[]): AccountCheck {
  const picked = pickEstimateCalendars(calendars);
  const byId = new Map(calendars.map((c) => [c.id, c]));
  const asset = calendars.find((c) => c.isActive !== false && norm(c.name) === norm(CONVERSION_ASSET_CALENDAR));
  const wanted: [string, RawCalendar | null | undefined][] = [
    ["Home Estimate", picked ? byId.get(picked.estimate.id) : null],
    ["Job", picked?.job ? byId.get(picked.job.id) : null],
    [CONVERSION_ASSET_CALENDAR, asset],
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
  ghl: "app" | "token" | "none" | "dead";
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

// The GHL rows when there is no working key to read them with.
export function blockedGhlChecks(): AccountCheck[] {
  return (["pipeline", "calendars", "owner-links", "owner-phone"] as const).map((id) => ({
    id,
    state: "blocked",
    detail: "Link GHL first",
  }));
}

// Display order on the page.
export const CHECK_ORDER: AccountCheckId[] = [
  "ghl",
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
