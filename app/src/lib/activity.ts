import { api } from "./tauri";

export type ActivityEventType =
  | "form.run"
  | "scraper.run"
  | "mockup.generated"
  | "outreach.drafted"
  | "outreach.sent"
  | "outreach.reply"
  | "memory.updated"
  | "client.added"
  | "scheduled.run";

export interface ActivityEvent {
  /** ISO 8601 UTC. Rust stamps this if omitted. */
  ts?: string;
  type: ActivityEventType;
  /** Required. One-liner shown in feed/popover. Keep under ~100 chars. */
  summary: string;
  clientSlug?: string;
  prospectSlug?: string;
  /** Path relative to repo root. Opened via Tauri opener on row click. */
  refPath?: string;
  /** When true, surfaces in bell popover even before any lastSeenAt is set. */
  hot?: boolean;
  meta?: Record<string, string | number | boolean>;
}

export interface ActivityTail {
  events: ActivityEvent[];
  total: number;
}

export interface ActivityState {
  lastSeenAt?: string;
}

/**
 * Null-safe wrapper. Swallows errors — activity logging must never break
 * the surface that calls it.
 */
export async function logActivity(
  root: string | null,
  event: ActivityEvent,
): Promise<void> {
  if (!root) return;
  try {
    await api.appendActivity(root, event);
  } catch (e) {
    console.warn("activity log failed:", e);
  }
}

const TYPE_LABELS: Record<ActivityEventType, string> = {
  "form.run": "Form",
  "scraper.run": "Scraper",
  "mockup.generated": "Mockup",
  "outreach.drafted": "Draft",
  "outreach.sent": "Sent",
  "outreach.reply": "Reply",
  "memory.updated": "Memory",
  "client.added": "Client",
  "scheduled.run": "Job",
};

const TYPE_COLORS: Record<ActivityEventType, string> = {
  "form.run": "var(--hml-accent, #6aa9ff)",
  "scraper.run": "#8b5cf6",
  "mockup.generated": "#22c55e",
  "outreach.drafted": "#a3a3a3",
  "outreach.sent": "#3b82f6",
  "outreach.reply": "#f59e0b",
  "memory.updated": "#10b981",
  "client.added": "#ec4899",
  "scheduled.run": "#64748b",
};

export function activityLabel(type: ActivityEventType): string {
  return TYPE_LABELS[type] ?? type;
}

export function activityDotColor(type: ActivityEventType): string {
  return TYPE_COLORS[type] ?? "#9ca3af";
}

export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
