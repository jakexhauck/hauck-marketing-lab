import { Mail, MessageSquare, Sparkles } from "lucide-react";
import { Panel } from "../../components/ui";
import { type Tone } from "../../lib/status";
import { PAGE_CONTAINER } from "../../lib/layout";

// Shared bits for the Campaigns surfaces (SMS + email the client sends to their
// own customers). Same golden rule as Social / Paid Ads: a real (connected)
// client must never see fabricated content. Pages render their designed,
// populated layout only in demo/preview mode (`?demo=1`); a real session shows
// the empty / zeroed state plus <NotConnectedNotice/> until the customer list
// and a texting/email number are linked.

// Shared scroll container for a Campaigns page. The one app-wide page container.
export const CAMPAIGNS_CONTAINER = PAGE_CONTAINER;

// ---------------------------------------------------------------------------
// Channels. The two ways a client reaches their customers. Email leans on the
// brand (indigo) tokens; SMS gets a sky accent (no app token, so inlined like a
// platform brand color).
// ---------------------------------------------------------------------------
export type Channel = "sms" | "email";

const SMS_BG = "rgba(14,165,233,.12)";
const SMS_FG = "#0284c7";

export function ChannelGlyph({ ch, size = 30 }: { ch: Channel; size?: number }) {
  const isSms = ch === "sms";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[8px]"
      style={{
        width: size,
        height: size,
        background: isSms ? SMS_BG : "var(--brand-tint)",
        color: isSms ? SMS_FG : "var(--brand-text)",
      }}
      aria-hidden
    >
      {isSms ? <MessageSquare size={size * 0.53} /> : <Mail size={size * 0.53} />}
    </span>
  );
}

export function ChannelChip({ ch }: { ch: Channel }) {
  const isSms = ch === "sms";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: isSms ? SMS_BG : "var(--brand-tint)",
        color: isSms ? SMS_FG : "var(--brand-text)",
      }}
    >
      {isSms ? <MessageSquare size={12} /> : <Mail size={12} />}
      {isSms ? "SMS" : "Email"}
    </span>
  );
}

// The standing "we run this for you" banner, shown on every Campaigns surface
// in a real session so an empty state reads as done-for-you, not a bug. The
// client never connects or sends anything themselves; we do it for them.
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
      <Sparkles size={20} className="mt-0.5 shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">We run your campaigns for you.</span>{" "}
        {message ??
          "Your text and email campaigns, and how they perform, will appear here once we start sending for you."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Demo data. One home-services client (Willis Plumbing), matching the Social /
// Paid Ads demos. Modest, plausible numbers, no fabricated growth percentages.
// Replaced by live GHL data later; the shapes stay the same.
// ---------------------------------------------------------------------------
export type CampaignStatus = "Scheduled" | "Draft" | "Sent";

export interface DemoCampaign {
  id: string;
  ch: Channel;
  title: string;
  audience: string;
  when: string;
  status: CampaignStatus;
  tone: Tone;
  sent?: string;
  rate?: string; // "43% opened" (email) or "31 replies" (sms)
  result?: string; // "7 jobs"
  body: string; // what customers saw (preview)
  subject?: string; // email only
}

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    id: "c-actuneup",
    ch: "sms",
    title: "Summer AC tune-up reminder",
    audience: "All customers",
    when: "Jun 28",
    status: "Scheduled",
    tone: "brand",
    body: "Hi {{first}}, it's Willis Plumbing. Beat the summer rush, book your AC tune-up and we'll keep it running cool all season. Reply YES for times.",
  },
  {
    id: "c-refer",
    ch: "email",
    title: "Refer a friend, get $25 off",
    audience: "All customers",
    when: "Jun 30",
    status: "Scheduled",
    tone: "brand",
    subject: "Give $25, get $25",
    body: "Know a neighbor who needs a great plumber? Send them our way and you both save $25 on your next job.",
  },
  {
    id: "c-garcia",
    ch: "email",
    title: "Garcia 5★ thank-you + review ask",
    audience: "Recent 5★ jobs",
    when: "Draft",
    status: "Draft",
    tone: "warning",
    subject: "Thank you, {{first}}!",
    body: "We loved helping with your recent job. If we earned it, a quick Google review helps your neighbors find us. Here's the link.",
  },
  {
    id: "c-drain",
    ch: "email",
    title: "Spring drain-cleaning special",
    audience: "All customers",
    when: "Jun 12",
    status: "Sent",
    tone: "positive",
    sent: "1,380",
    rate: "43% opened",
    result: "7 jobs",
    subject: "$25 off drain cleaning this month",
    body: "A quick, clean fix before a small clog becomes a weekend emergency. Book online in under a minute.",
  },
  {
    id: "c-heat",
    ch: "sms",
    title: "Heat wave: book your AC check",
    audience: "No A/C service in 12mo",
    when: "Jun 8",
    status: "Sent",
    tone: "positive",
    sent: "980",
    rate: "31 replies",
    result: "5 jobs",
    body: "Hi {{first}}, the heat is coming. Book a quick AC check now so you're not stuck without cool air. Reply BOOK and we'll text you times.",
  },
  {
    id: "c-tech",
    ch: "email",
    title: "Meet your technician",
    audience: "New customers",
    when: "Jun 5",
    status: "Sent",
    tone: "positive",
    sent: "1,360",
    rate: "44% opened",
    result: "2 jobs",
    subject: "A quick hello from your Willis Plumbing tech",
    body: "We like you to know who's coming to your door. Here's a quick intro to the team that looks after your home.",
  },
  {
    id: "c-news",
    ch: "email",
    title: "May newsletter: 3 spring plumbing tips",
    audience: "All customers",
    when: "May 20",
    status: "Sent",
    tone: "positive",
    sent: "1,340",
    rate: "39% opened",
    result: "2 jobs",
    subject: "3 spring plumbing tips (and one to avoid)",
    body: "A few small habits this spring that save you a big repair bill later. Plus the one mistake we see every week.",
  },
];

export const DEMO_AUDIENCE_MEMBERS: { name: string; sub: string; initials: string }[] = [
  { name: "The Garcias", sub: "Water heater · Jun 2", initials: "G" },
  { name: "Mark T.", sub: "AC tune-up · May 28", initials: "M" },
  { name: "Janet R.", sub: "Drain cleaning · May 21", initials: "J" },
  { name: "The Reyes", sub: "AC install · May 14", initials: "R" },
  { name: "Tom B.", sub: "Burst pipe · May 9", initials: "T" },
  { name: "The Hendersons", sub: "Last job Jun 2025", initials: "H" },
];

// Reactivation's live counts now come from the GHL Database Reactivation
// pipeline via /api/campaigns/reactivation (shape + demo payload in
// src/lib/reactivation.ts), so the old hand-authored REACT_* demo constants
// were removed. DEMO_INSIGHTS below still backs the Campaigns Insights tab.

export const DEMO_INSIGHTS = {
  summary: [
    { label: "Messages sent", value: "4,440" },
    { label: "Email open rate", value: "42%" },
    { label: "SMS reply rate", value: "4.1%" },
    { label: "Jobs booked", value: "14", brand: true },
  ] as { label: string; value: string; brand?: boolean }[],
  takeaway:
    "SMS gets a faster reply, email reaches more people. Friday-morning sends book the most jobs, so we'll keep leading there.",
};
