import { Link2, Mail, MessageSquare } from "lucide-react";
import { Panel, Button } from "../../components/ui";
import { type Tone } from "../../lib/status";

// Shared bits for the Campaigns surfaces (SMS + email the client sends to their
// own customers). Same golden rule as Social / Paid Ads: a real (connected)
// client must never see fabricated content. Pages render their designed,
// populated layout only in demo/preview mode (`?demo=1`); a real session shows
// the empty / zeroed state plus <NotConnectedNotice/> until the customer list
// and a texting/email number are linked through GoHighLevel.

// Shared scroll container for a Campaigns page (mirrors SOCIAL_CONTAINER).
export const CAMPAIGNS_CONTAINER =
  "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8";

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

// The standing "nothing is linked yet" banner, shown on every Campaigns surface
// in a real session so the empty state is never mistaken for a bug.
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
      <Link2 size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">Your messaging isn't connected yet.</span>{" "}
        {message ??
          "Once we link your customer list and a texting/email number through GoHighLevel, your campaigns, audiences and results show up here. Sending stays switched off until then."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect messaging (coming soon)
      </Button>
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

export interface DemoAudience {
  id: string;
  name: string;
  count: string;
  desc: string;
}

export const DEMO_AUDIENCES: DemoAudience[] = [
  { id: "all", name: "All customers", count: "1,420", desc: "Everyone in your customer list with a phone or email on file." },
  { id: "past", name: "Past customers", count: "640", desc: "No booked job in the last 12 months. Ripe for a win-back." },
  { id: "vip", name: "Repeat / VIP", count: "212", desc: "Booked 3+ jobs. Your most loyal customers." },
  { id: "new", name: "New customers", count: "96", desc: "First job booked in the last 60 days." },
  { id: "fivestar", name: "Recent 5★ jobs", count: "28", desc: "Left a 5★ review or rated the job highly. Great for referrals." },
  { id: "noac", name: "No A/C service in 12mo", count: "980", desc: "Due for a tune-up before the summer heat." },
];

export const DEMO_AUDIENCE_MEMBERS: { name: string; sub: string; initials: string }[] = [
  { name: "The Garcias", sub: "Water heater · Jun 2", initials: "G" },
  { name: "Mark T.", sub: "AC tune-up · May 28", initials: "M" },
  { name: "Janet R.", sub: "Drain cleaning · May 21", initials: "J" },
  { name: "The Reyes", sub: "AC install · May 14", initials: "R" },
  { name: "Tom B.", sub: "Burst pipe · May 9", initials: "T" },
  { name: "The Hendersons", sub: "Last job Jun 2025", initials: "H" },
];

export interface DemoTemplate {
  id: string;
  ch: Channel;
  category: string;
  title: string;
  body: string;
}

export const DEMO_TEMPLATES: DemoTemplate[] = [
  { id: "t-tuneup", ch: "sms", category: "Reminder", title: "Seasonal tune-up reminder", body: "Hi {{first}}, it's Willis Plumbing. Beat the summer rush, book your AC tune-up and we'll keep it running cool all season. Reply YES and we'll text you times." },
  { id: "t-special", ch: "email", category: "Promo", title: "Monthly special", body: "$25 off drain cleaning this month. A quick, clean fix before a small clog becomes a weekend emergency. Book online in under a minute." },
  { id: "t-review", ch: "email", category: "Review", title: "5★ thank-you + review ask", body: "Thank you, {{first}}! We loved helping with your recent job. If we earned it, a quick Google review helps your neighbors find us. Here's the link." },
  { id: "t-winback", ch: "sms", category: "Win-back", title: "We miss you", body: "Hi {{first}}, it's been a while! Your plumbing deserves a checkup. Book this month and take $25 off any service. Reply BOOK to grab a slot." },
  { id: "t-refer", ch: "email", category: "Referral", title: "Refer a friend", body: "Give $25, get $25. Know a neighbor who needs a great plumber? Send them our way, you both save $25 on your next job." },
  { id: "t-confirm", ch: "sms", category: "Confirmation", title: "Appointment reminder", body: "Reminder: your Willis Plumbing visit is tomorrow between {{window}}. Reply C to confirm or R to reschedule." },
];

export interface DemoIdea {
  kind: string;
  ch: Channel;
  title: string;
}

export const DEMO_IDEAS: DemoIdea[] = [
  { kind: "Seasonal", ch: "sms", title: "Text an AC tune-up reminder before the heat wave" },
  { kind: "Win-back", ch: "email", title: "Email the 12 customers overdue for service" },
  { kind: "Review", ch: "sms", title: "Turn the Garcia 5★ into a thank-you text" },
];

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
