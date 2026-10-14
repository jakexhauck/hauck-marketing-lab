// Organic leads: the website's own output, as opposed to the paid-ads output the
// Lead Tracker reports on.
//
// The source of truth is ONE GHL pipeline named "Organic", which Jake's
// automations write into: a website form fill or a chat-widget message creates
// the contact and drops an opportunity into the matching stage. The app never
// receives the webhook itself, it only reads what the automation left behind.
//
// Live Willis shape, confirmed 2026-08-02:
//   Organic [ElzjlzovQewPnhpXq7Pj]
//     - Chat Widget    [5d3710a5-b9a9-483f-adf7-93ad0efa2de2]
//     - Estimate Form  [836d964a-2f94-422d-a7e8-bfc674ff5890]
//
// Stage ids differ per client, so classification is BY STAGE NAME. The older
// api/forms/submissions split the same pipeline by the opportunity's `source`
// string instead, which does not survive an automation that leaves source null
// (every live Organic opportunity has source: null). Stage is what the
// automation actually sets, so stage is what we read.

export type OrganicChannel = "form" | "chat" | "other";

export interface OrganicPipeline {
  pipelineId: string;
  // stage id -> verbatim stage name, for labelling and classification.
  stageNames: Map<string, string>;
}

interface PipelineDef {
  id: string;
  name?: string;
  stages?: { id: string; name?: string }[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

// Find the tenant's Organic pipeline by name. Exact match first, then a
// contains match so "Organic Pipeline" / "Organic Leads" resolve too. No
// hardcoded id fallback: an id from one client's location cannot be correct for
// another, and returning null lets the caller hide the page instead of showing
// an empty one.
export function resolveOrganicPipeline(pipelines: PipelineDef[]): OrganicPipeline | null {
  const pipe =
    pipelines.find((p) => norm(p.name ?? "") === "organic") ??
    pipelines.find((p) => norm(p.name ?? "").includes("organic"));
  if (!pipe) return null;
  const stageNames = new Map<string, string>();
  for (const s of pipe.stages ?? []) stageNames.set(s.id, s.name ?? "");
  return { pipelineId: pipe.id, stageNames };
}

// Which column a lead belongs in, from its stage name.
//
// "other" rather than dropping the lead: if a client's Organic pipeline grows a
// third stage, an unrecognised name must still be visible somewhere. A lead that
// exists in GHL and nowhere in the app is the failure mode worth avoiding.
export function organicChannel(stageName: string): OrganicChannel {
  const key = norm(stageName);
  if (!key) return "other";
  if (key.includes("chat") || key.includes("widget")) return "chat";
  if (key.includes("form") || key.includes("estimate")) return "form";
  return "other";
}

// Custom fields never shown on a client-facing page, matched on the bare field
// key (the "contact." prefix stripped).
//
// Two groups, and both matter:
//   1. Agency onboarding fields. Willis's location carries
//      `password_to_use_for_crm_login` and `email_to_use_for_crm_login` from the
//      intake funnel. Rendering "every populated field" without this list would
//      put a credential on a page the client's staff can open.
//   2. Automation scratch space. `ai_response`, `thread`, `status` and friends
//      are written by GHL workflows as working state, not by the lead. They are
//      noise at best and confusing at worst next to real answers.
//
// Anything containing "password" is blocked regardless, so a field added later
// cannot leak one by being absent from this list.
const DENIED_FIELD_KEYS = new Set([
  "password_to_use_for_crm_login",
  "email_to_use_for_crm_login",
  "ai_response",
  "user_response",
  "review_response",
  "response",
  "thread",
  "status",
  "call_confirm_click",
  "last_appt_id",
  "closed_revenue",
  "showed_interest",
  "spring_message",
]);

export function isDeniedField(fieldKey: string): boolean {
  const bare = norm(fieldKey).replace(/^contact\./, "");
  if (!bare) return true;
  if (bare.includes("password")) return true;
  return DENIED_FIELD_KEYS.has(bare);
}

// A custom-field value as GHL returns it: a string for TEXT/LARGE_TEXT/RADIO, an
// array for CHECKBOX, occasionally a number. Rendered as one readable line.
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}

export interface OrganicAnswer {
  label: string;
  value: string;
}

export interface CustomFieldDef {
  id: string;
  name?: string;
  fieldKey?: string;
}

// Turn a contact's {id, value} pairs into labelled answers, dropping empties and
// denied fields. Order follows the location's field definitions so two leads
// from the same form list their answers the same way round.
export function readableAnswers(
  customFields: { id?: string; value?: unknown }[] | undefined,
  defs: CustomFieldDef[],
): OrganicAnswer[] {
  if (!customFields?.length) return [];
  const byId = new Map<string, unknown>();
  for (const f of customFields) {
    if (f.id) byId.set(f.id, f.value);
  }
  const answers: OrganicAnswer[] = [];
  for (const def of defs) {
    if (!def.id || !byId.has(def.id)) continue;
    if (isDeniedField(def.fieldKey ?? "")) continue;
    const value = formatFieldValue(byId.get(def.id));
    if (!value) continue;
    answers.push({ label: def.name?.trim() || def.fieldKey || "Answer", value });
  }
  return answers;
}
