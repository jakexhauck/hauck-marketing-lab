// Pure helpers for the admin audit viewer (/admin/audit).
//
// The audit log is the only record of who messaged a client's customers, so
// the viewer has to stay readable no matter what a writer put in `payload`.
// Payloads are arbitrary JSON (a `setter.send` row carries a whole message
// body), and an untruncated one would blow the table layout apart. Everything
// here is display-only string work, kept out of the component so it can be
// tested without rendering anything.

// Actions written by logAdminAction today. This is a convenience list for the
// filter dropdown, not a source of truth: the viewer merges it with whatever
// actions actually appear in the loaded rows, so a newly added action shows up
// in the filter the first time it is seen rather than waiting on an edit here.
export const KNOWN_AUDIT_ACTIONS: string[] = [
  "setter.send",
  "setter.book",
  "setter.dial",
  "setter.tags",
  "client.create",
  "client.update",
  "client.billing.update",
  "client.entitlement",
  "client.import_staff",
  "client.preview",
  "client.preview_token",
  "client.website_pages.update",
  "staff.create",
  "staff.update",
  "staff.disable",
  "task.create",
  "task.update",
  "task.delete",
  "ads.creative.create",
  "ads.metaAdDays.sync",
];

// Plain-English names for the actions worth spelling out. Anything missing
// falls back to a humanized form of the raw action string.
const ACTION_LABELS: Record<string, string> = {
  "setter.send": "Message sent to a customer",
  "setter.book": "Appointment booked",
  "setter.dial": "Dial logged",
  "setter.tags": "Tags applied",
  "client.preview": "Signed in as a client",
  "client.preview_token": "Client preview token minted",
};

export function auditActionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const words = action.replace(/[._]+/g, " ").trim();
  if (!words) return action;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Actions that put a message in front of a client's customer. These get called
// out visually because they are the ones with no undo.
export function isOutboundAction(action: string): boolean {
  return action === "setter.send";
}

// The curated list plus every action present in the loaded rows, deduped and
// sorted, so the filter never hides an action the log actually contains.
export function mergeActionOptions(
  curated: readonly string[],
  actions: readonly string[],
): string[] {
  const set = new Set<string>();
  for (const a of curated) if (a) set.add(a);
  for (const a of actions) if (a) set.add(a);
  return Array.from(set).sort();
}

export function hasAuditPayload(payload: unknown): boolean {
  if (payload === null || payload === undefined) return false;
  if (typeof payload === "object" && !Array.isArray(payload)) {
    return Object.keys(payload as Record<string, unknown>).length > 0;
  }
  if (Array.isArray(payload)) return payload.length > 0;
  return String(payload).length > 0;
}

function scalarToText(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  return "{...}";
}

function truncate(text: string, maxLen: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, Math.max(0, maxLen - 3))}...`;
}

// A one-line gist of a payload for the collapsed row. Deliberately lossy: the
// full JSON is one click away, and this only has to say whether the row is
// worth opening.
export function summarizeAuditPayload(payload: unknown, maxKeys = 3, maxLen = 48): string {
  if (!hasAuditPayload(payload)) return "No details";
  if (Array.isArray(payload)) {
    return `${payload.length} item${payload.length === 1 ? "" : "s"}`;
  }
  if (typeof payload !== "object") return truncate(String(payload), maxLen * 2);

  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  const shown = keys
    .slice(0, maxKeys)
    .map((k) => `${k}: ${truncate(scalarToText(record[k]), maxLen)}`);
  const rest = keys.length - shown.length;
  if (rest > 0) shown.push(`+${rest} more`);
  return shown.join(", ");
}

// The expanded view. Pretty JSON, or the raw value if it will not serialize
// (a circular payload should not take the page down).
export function prettyAuditPayload(payload: unknown): string {
  if (!hasAuditPayload(payload)) return "No details recorded.";
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

// Timestamps come back as ISO strings from Postgres. A bad or missing one
// renders as a dash rather than "Invalid Date".
export function formatAuditTimestamp(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Showing 1 to 50 of 214", or a plain count when the page covers everything.
export function describeAuditRange(offset: number, shown: number, total: number): string {
  if (total <= 0 || shown <= 0) return "No entries";
  const first = offset + 1;
  const last = offset + shown;
  if (first === 1 && last >= total) {
    return `${total} ${total === 1 ? "entry" : "entries"}`;
  }
  return `Showing ${first} to ${last} of ${total}`;
}
