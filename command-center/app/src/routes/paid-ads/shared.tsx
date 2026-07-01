import { Link2 } from "lucide-react";
import { Panel, Button, Badge } from "../../components/ui";
import { PAGE_CONTAINER } from "../../lib/layout";
import { toneDot, type Tone } from "../../lib/status";
import { cn } from "../../lib/cn";

// Shared bits for the Paid Ads surfaces. Same golden rule as Social: a real
// (connected) client must never see fabricated content. Pages render their
// designed, populated layout only in demo/preview mode (`?demo=1`); a real
// session shows the empty / zeroed state plus <NotConnectedNotice/> until the
// Meta ad account is linked.

// Shared scroll container for a Paid Ads page. The one app-wide page container.
export const PAID_ADS_CONTAINER = PAGE_CONTAINER;

// ---------------------------------------------------------------------------
// Lead status buckets. These are NOT raw GHL stage names: a paid-ad lead's real
// journey spans two pipelines (Paid Ad's, then Sales). We roll the 15 real
// stages into 6 plain, client-friendly buckets. When live GHL data is wired,
// resolve each opportunity's stageId -> bucket via STAGE_TO_BUCKET below. See
// docs/build-plans/18-paid-ads-hub.md and the reference_ghl_pipeline_stages memory.
// ---------------------------------------------------------------------------
export type LeadBucket =
  | "new"
  | "reaching"
  | "in_touch"
  | "quote"
  | "won"
  | "not_fit";

export const LEAD_BUCKET: Record<LeadBucket, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "brand" },
  reaching: { label: "Trying to reach", tone: "warning" },
  in_touch: { label: "In touch", tone: "brand" },
  quote: { label: "Quote sent", tone: "neutral" },
  won: { label: "Won", tone: "positive" },
  not_fit: { label: "Not a fit", tone: "neutral" },
};

// The real GHL stage -> client bucket map, ready for the future live wiring. The
// UI does not read this yet (demo data is already bucketed), but it keeps the
// mapping next to the buckets it defines so the two never drift.
export const STAGE_TO_BUCKET: Record<string, LeadBucket> = {
  // Paid Ad's Pipeline (sdBUBRxljQHm2yb2w9MG)
  "Lead In": "new",
  "Lead In No Appointment Booked": "new",
  "No answer": "reaching",
  "Intro Call No Confirmation": "reaching",
  "Lead Responded": "in_touch",
  "Intro Call Waiting Confirmation": "in_touch",
  // Sales Pipeline (bKDivijtLXU8QvIPxMIz)
  "Intro Call Confirmed": "in_touch",
  "Estimate Scheduled": "quote",
  "Estimate Completed": "quote",
  "Job Booked": "won",
  "Job Completed": "won",
  "Not Qualified": "not_fit",
  "No-Close": "not_fit",
  Abandoned: "not_fit",
};

export function StatusChip({ bucket }: { bucket: LeadBucket }) {
  const meta = LEAD_BUCKET[bucket];
  return (
    <Badge tone={meta.tone}>
      <span className={cn("h-1.5 w-1.5 rounded-full", toneDot[meta.tone])} aria-hidden />
      {meta.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Platforms. The two ad channels a client runs (Meta = Instagram + Facebook).
// ---------------------------------------------------------------------------
export type Platform = "ig" | "fb";

export const PLATFORM: Record<Platform, { bg: string; label: string; name: string }> = {
  ig: { bg: "linear-gradient(135deg,#feda75,#d62976,#962fbf)", label: "IG", name: "Instagram" },
  fb: { bg: "#1877f2", label: "f", name: "Facebook" },
};

export function PlatformGlyph({ p, size = 20 }: { p: Platform; size?: number }) {
  const meta = PLATFORM[p];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[6px] font-bold text-white"
      style={{ width: size, height: size, backgroundImage: meta.bg, fontSize: size * 0.45 }}
      aria-label={meta.name}
    >
      {meta.label}
    </span>
  );
}

// The standing "nothing is linked yet" banner, shown on every Paid Ads surface in
// a real session so the empty state is never mistaken for a bug.
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
      <Link2 size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">Not connected yet.</span>{" "}
        {message ??
          "To see your real ad results, we still need to connect your Meta ad account (Facebook and Instagram)."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect ads (coming soon)
      </Button>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Demo data. One home-services client (Thompson Heating & Air). Shaped to the
// 6 buckets + the metric definitions in the build plan. Replaced by live Meta +
// GHL data later; the shapes stay the same.
// ---------------------------------------------------------------------------
export interface DemoAd {
  id: string;
  headline: string;
  copy: string;
  platforms: Platform[];
  active: boolean;
  leads: number;
  reach: number;
  thumb: string; // CSS gradient placeholder
  thumbLabel: string;
  blurb: string; // one plain line for the Overview "Running now" list
}

export const DEMO_ADS: DemoAd[] = [
  {
    id: "ad-hotwater",
    headline: "Same-day hot water",
    copy: "Cold shower this morning? We can have hot water back today. Same-day water heater repair, $59 service call.",
    platforms: ["ig", "fb"],
    active: true,
    leads: 12,
    reach: 2100,
    thumb: "linear-gradient(135deg,#4f46e5,#7c73f0 60%,#db2777)",
    thumbLabel: "Photo: technician fixing water heater",
    blurb: "Your top performer this month",
  },
  {
    id: "ad-actuneup",
    headline: "$59 AC tune-up before the heat wave",
    copy: "Beat the heat. Get your AC tuned up for just $59 before summer hits. Book in 60 seconds.",
    platforms: ["fb"],
    active: true,
    leads: 9,
    reach: 1840,
    thumb: "linear-gradient(135deg,#0ea5e9,#4f46e5)",
    thumbLabel: "Photo: AC unit tune-up close-up",
    blurb: "Steady and reliable",
  },
  {
    id: "ad-burstpipe",
    headline: "Burst pipe? We're here 24/7",
    copy: "Water everywhere? Call now, we answer 24/7 and can be there fast.",
    platforms: ["ig"],
    active: true,
    leads: 6,
    reach: 980,
    thumb: "linear-gradient(135deg,#0f172a,#334155 70%,#0ea5e9)",
    thumbLabel: "Photo: van arriving at night",
    blurb: "Catches the urgent calls",
  },
  {
    id: "ad-garcias",
    headline: "5 stars from the Garcias",
    copy: "Real review from a real neighbor. See why families trust us with their home.",
    platforms: ["fb"],
    active: false,
    leads: 5,
    reach: 760,
    thumb: "linear-gradient(135deg,#f59e0b,#db2777)",
    thumbLabel: "Photo: smiling family at front door",
    blurb: "Paused for now",
  },
];

export interface DemoLead {
  name: string;
  initials: string;
  avatar: string; // CSS gradient
  when: string;
  how: "call" | "form";
  fromAd: string;
  bucket: LeadBucket;
}

export const DEMO_LEADS: DemoLead[] = [
  { name: "Marcus Webb", initials: "MW", avatar: "linear-gradient(135deg,#4f46e5,#7c73f0)", when: "2h ago", how: "call", fromAd: "Same-day hot water", bucket: "new" },
  { name: "Dana Liu", initials: "DL", avatar: "linear-gradient(135deg,#0ea5e9,#2563eb)", when: "Today 9:14 AM", how: "form", fromAd: "$59 AC tune-up", bucket: "in_touch" },
  { name: "The Garcias", initials: "TG", avatar: "linear-gradient(135deg,#16a34a,#0ea5e9)", when: "Yesterday", how: "call", fromAd: "Burst pipe 24/7", bucket: "won" },
  { name: "Priya Shah", initials: "PS", avatar: "linear-gradient(135deg,#db2777,#f59e0b)", when: "Yesterday", how: "form", fromAd: "Same-day hot water", bucket: "quote" },
  { name: "Tom Becker", initials: "TB", avatar: "linear-gradient(135deg,#f59e0b,#d97706)", when: "2 days ago", how: "call", fromAd: "$59 AC tune-up", bucket: "reaching" },
  { name: "Lena Ortiz", initials: "LO", avatar: "linear-gradient(135deg,#7c73f0,#db2777)", when: "3 days ago", how: "form", fromAd: "Same-day hot water", bucket: "won" },
];

// Leads each week, Overview bar chart (trending up across the month).
export const DEMO_WEEKLY = [
  { label: "Week 1", value: 6 },
  { label: "Week 2", value: 7 },
  { label: "Week 3", value: 9 },
  { label: "Week 4", value: 10 },
];
