// Client-side Social types + pure mappers, matching the shapes returned by
// functions/api/social/*. The mappers run on REAL data only (a real session);
// the route files keep their own hand-authored demo constants for `?demo=1`, so
// nothing here touches the demo layout. Platform union is identical to
// routes/social/shared's `Platform`, so the two are interchangeable.

export type SocialPlatform = "ig" | "fb" | "gb";
export type SocialStatus = "scheduled" | "draft" | "posted" | "failed";

export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  name: string;
  avatar: string | null;
}

export interface SocialPost {
  id: string;
  summary: string;
  status: SocialStatus;
  scheduleAt: string | null;
  publishedAt: string | null;
  platforms: SocialPlatform[];
  mediaUrls: string[];
}

export interface AccountsData {
  accounts: SocialAccount[];
  connected: boolean;
}

export interface PostsResponse {
  posts: SocialPost[];
  total: number;
}

const PLATFORM_NAME: Record<SocialPlatform, string> = {
  ig: "Instagram",
  fb: "Facebook",
  gb: "Google",
};

// A post's headline: its first non-empty line, trimmed for a row. GHL summaries
// are the caption, which can be multi-paragraph, so we only show the opener.
export function postTitle(p: SocialPost): string {
  const first = (p.summary.split("\n").find((l) => l.trim()) ?? "").trim();
  if (!first) return "Untitled post";
  return first.length > 80 ? first.slice(0, 80).trimEnd() + "…" : first;
}

// The platform used for a post's glyph. A post can target several; we lead with
// the first and list the rest in the meta line.
export function primaryPlatform(p: SocialPost): SocialPlatform {
  return p.platforms[0] ?? "fb";
}

export function platformNames(ps: SocialPlatform[]): string {
  return ps.map((p) => PLATFORM_NAME[p]).join(" + ");
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// "Sat, Jun 14 · 6:00 PM" from an ISO string, in the browser's local time.
// Empty string when the input is missing/unparseable, so callers can guard.
export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${WEEKDAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()} · ${h}:${pad2(
    d.getMinutes(),
  )} ${ampm}`;
}

// "Jun 14" from an ISO string (used for the "recently posted" meta line).
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTH[d.getMonth()]} ${d.getDate()}`;
}

function timeMs(p: SocialPost): number {
  const v = p.scheduleAt ?? p.publishedAt;
  const t = v ? +new Date(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Overview KPIs we can actually compute (no analytics endpoint exists, so reach
// and calls are not derivable and the Overview shows "-" for them).
export function socialKpis(
  posts: SocialPost[],
  nowMs: number,
): { postsThisMonth: number; scheduled: number } {
  const now = new Date(nowMs);
  const y = now.getFullYear();
  const m = now.getMonth();
  let postsThisMonth = 0;
  let scheduled = 0;
  for (const p of posts) {
    if (p.status === "scheduled") scheduled += 1;
    if (p.status === "posted" && p.publishedAt) {
      const d = new Date(p.publishedAt);
      if (d.getFullYear() === y && d.getMonth() === m) postsThisMonth += 1;
    }
  }
  return { postsThisMonth, scheduled };
}

// Next scheduled posts, soonest first.
export function upNextPosts(posts: SocialPost[], n: number): SocialPost[] {
  return posts
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => (+new Date(a.scheduleAt ?? 0)) - (+new Date(b.scheduleAt ?? 0)))
    .slice(0, n);
}

// Most recently published posts, newest first.
export function recentPosts(posts: SocialPost[], n: number): SocialPost[] {
  return posts
    .filter((p) => p.status === "posted")
    .sort((a, b) => (+new Date(b.publishedAt ?? 0)) - (+new Date(a.publishedAt ?? 0)))
    .slice(0, n);
}

// My Posts buckets. A failed post lands in "scheduled" (it was an attempt, not a
// draft and not live) and carries its own badge in the row.
export function postsByBucket(posts: SocialPost[]): {
  scheduled: SocialPost[];
  drafts: SocialPost[];
  posted: SocialPost[];
} {
  const scheduled: SocialPost[] = [];
  const drafts: SocialPost[] = [];
  const posted: SocialPost[] = [];
  for (const p of posts) {
    if (p.status === "draft") drafts.push(p);
    else if (p.status === "posted") posted.push(p);
    else scheduled.push(p); // scheduled + failed
  }
  scheduled.sort((a, b) => timeMs(a) - timeMs(b));
  posted.sort((a, b) => timeMs(b) - timeMs(a));
  return { scheduled, drafts, posted };
}

export interface CalEvent {
  p: SocialPlatform;
  label: string;
  id: string;
}
export interface CalCell {
  day: number;
  out?: boolean; // padding day from the prev/next month
  today?: boolean;
  events?: CalEvent[];
}

// Build a Monday-first month grid (matching the demo layout) with real posts
// dropped on their local date. Padding days from the neighbouring months are
// marked `out`. `viewMonth` is 0-11.
export function buildMonthGrid(
  viewYear: number,
  viewMonth: number,
  posts: SocialPost[],
  nowMs: number,
): CalCell[] {
  // Group posts by "YYYY-M-D" (local) for O(1) day lookup.
  const byKey = new Map<string, CalEvent[]>();
  for (const p of posts) {
    const iso = p.scheduleAt ?? p.publishedAt;
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const ev: CalEvent = { p: primaryPlatform(p), label: postTitle(p), id: p.id };
    const list = byKey.get(key);
    if (list) list.push(ev);
    else byKey.set(key, [ev]);
  }

  const now = new Date(nowMs);
  const isToday = (day: number) =>
    now.getFullYear() === viewYear &&
    now.getMonth() === viewMonth &&
    now.getDate() === day;

  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

  const cells: CalCell[] = [];
  // Leading padding (prev month tail).
  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: daysInPrev - firstDow + 1 + i, out: true });
  }
  // In-month days.
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${viewYear}-${viewMonth}-${day}`;
    cells.push({ day, today: isToday(day), events: byKey.get(key) });
  }
  // Trailing padding to complete the final week (full weeks only).
  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (firstDow + daysInMonth) + 1;
    cells.push({ day: nextDay, out: true });
  }
  return cells;
}

// ----- Demo sample data (used only by src/demo/handlers/social.ts) -----
// So a hook that happens to run in a demo tab resolves cleanly instead of 404ing.
// The route files still render their own richer demo constants; these mirror the
// real API shape.

export const DEMO_SOCIAL_ACCOUNTS: SocialAccount[] = [
  { id: "demo-ig", platform: "ig", name: "yourbusiness", avatar: null },
  { id: "demo-fb", platform: "fb", name: "Your Business", avatar: null },
  { id: "demo-gb", platform: "gb", name: "Your Business", avatar: null },
];

export const DEMO_SOCIAL_POSTS: SocialPost[] = [
  {
    id: "demo-1",
    summary: "Same-day hot water — Thompson job",
    status: "scheduled",
    scheduleAt: "2026-07-11T18:00:00Z",
    publishedAt: null,
    platforms: ["ig", "fb"],
    mediaUrls: [],
  },
  {
    id: "demo-2",
    summary: "AC tune-up before the heat wave",
    status: "scheduled",
    scheduleAt: "2026-07-12T09:00:00Z",
    publishedAt: null,
    platforms: ["fb"],
    mediaUrls: [],
  },
  {
    id: "demo-3",
    summary: "Drain mistake every homeowner makes",
    status: "draft",
    scheduleAt: null,
    publishedAt: null,
    platforms: ["gb"],
    mediaUrls: [],
  },
  {
    id: "demo-4",
    summary: "5★ review from the Garcias",
    status: "posted",
    scheduleAt: null,
    publishedAt: "2026-06-14T15:00:00Z",
    platforms: ["ig"],
    mediaUrls: [],
  },
  {
    id: "demo-5",
    summary: "Burst pipe save, before/after",
    status: "posted",
    scheduleAt: null,
    publishedAt: "2026-06-09T15:00:00Z",
    platforms: ["fb"],
    mediaUrls: [],
  },
];
