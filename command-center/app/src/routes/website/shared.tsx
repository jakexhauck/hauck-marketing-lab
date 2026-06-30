import type { ReactNode } from "react";
import { Globe, Lock, Droplet, Flame, AlertTriangle, Phone, Mail, MapPin, ArrowRight } from "lucide-react";
import { Panel, Button, Segmented } from "../../components/ui";
import type { Tone } from "../../lib/status";
import { cn } from "../../lib/cn";

// Shared kit for the Website surfaces (the "Storefront" direction). The golden
// rule from Social applies: a real (connected) client must never see fabricated
// content. Pages render their designed, populated layout only in demo/preview
// mode (`?demo=1`); in a real session they show the zeroed / empty state plus
// <NotConnectedNotice/> until the site and its analytics are connected.

// Shared scroll container. Mirrors SOCIAL_CONTAINER but a wider max-width so the
// large browser previews have room to breathe.
export const WEBSITE_CONTAINER =
  "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-5 pb-12 pt-5 lg:px-8";

// The demo client's domain, shown in every browser address bar.
export const WEBSITE_DOMAIN = "rivertownplumbing.com";

// Near-ink browser chrome. A fixed value (not a theme token) so the window frame
// reads the same in light and dark, like a real browser.
const CHROME = "#14161f";

export type Device = "desktop" | "mobile";

// ---------------------------------------------------------------------------
// Not-connected banner (website equivalent of Social's).
// ---------------------------------------------------------------------------
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
      <Globe size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">Not connected yet.</span>{" "}
        {message ??
          "To see your real visitor numbers and live pages, we still need to connect your site and analytics."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect website (coming soon)
      </Button>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// BrowserFrame: a reusable browser window. Pure presentational. Body renders any
// children (usually <SiteMock/>); device="mobile" narrows to a phone-shaped frame.
// ---------------------------------------------------------------------------
export function BrowserFrame({
  url,
  device = "desktop",
  children,
  className,
}: {
  url: string;
  device?: Device;
  children: ReactNode;
  className?: string;
}) {
  const mobile = device === "mobile";
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-surface shadow-[var(--shadow-lg)] transition-[max-width] duration-300",
        mobile && "mx-auto max-w-[390px]",
        className,
      )}
    >
      <div
        className="flex h-[42px] shrink-0 items-center gap-3.5 px-3.5"
        style={{ background: CHROME }}
      >
        <div className="flex gap-[7px]">
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "#ff5f57" }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "#febc2e" }} />
          <span className="h-[11px] w-[11px] rounded-full" style={{ background: "#28c840" }} />
        </div>
        <div
          className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium"
          style={{ background: "rgba(255,255,255,.1)", color: "#c7cad8", maxWidth: 380 }}
        >
          <Lock size={12} className="shrink-0 opacity-80" />
          <span className="truncate">{url}</span>
        </div>
      </div>
      <div className="overflow-hidden bg-white">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeviceToggle: Desktop / Mobile control (reuses Segmented).
// ---------------------------------------------------------------------------
export function DeviceToggle({
  value,
  onChange,
  className,
}: {
  value: Device;
  onChange: (d: Device) => void;
  className?: string;
}) {
  return (
    <Segmented<Device>
      options={[
        { value: "desktop", label: "Desktop" },
        { value: "mobile", label: "Mobile" },
      ]}
      value={value}
      onChange={onChange}
      size="sm"
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// SiteMock: the CSS-rendered demo homepage / pages shown inside BrowserFrame.
// Demo-only stand-in content; the real build swaps in the actual site. The site
// uses its own fixed palette (navy + blue on white) on purpose, independent of
// the app theme, so the preview looks like a real third-party website.
// ---------------------------------------------------------------------------
interface SiteContent {
  h1: string;
  sub: string;
  body: "services" | "contact";
}

const PAGE_CONTENT: Record<SitePageKey, SiteContent> = {
  home: {
    h1: "Fast, reliable plumbing in Rivertown",
    sub: "Same-day service, upfront pricing, and licensed techs who treat your home with respect. Booked in under two minutes.",
    body: "services",
  },
  services: {
    h1: "Plumbing and heating, done right the first time",
    sub: "From a dripping tap to a full heating system, our licensed techs handle it with upfront pricing and no surprises.",
    body: "services",
  },
  about: {
    h1: "A Rivertown family business since 2009",
    sub: "Three generations of plumbers serving our neighbors. We show up on time and clean up after ourselves.",
    body: "services",
  },
  reviews: {
    h1: "What your neighbors say about us",
    sub: "4.9 stars from 212 verified Rivertown customers. Read why locals call us first.",
    body: "services",
  },
  contact: {
    h1: "Get in touch with Rivertown Plumbing",
    sub: "Call (555) 014-2210 or send a message. We answer fast, and we will give you a window you can count on.",
    body: "contact",
  },
  book: {
    h1: "Book a visit in under two minutes",
    sub: "Pick a time that works for you. You will get a confirmation text and a reminder before we arrive.",
    body: "services",
  },
};

const NAVY = "#0e2a4d";
const BLUE = "#0e63c4";

function SvcCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div
      className="rounded-[12px] border p-[18px]"
      style={{ borderColor: "#eef0f5", background: "#fbfcfe" }}
    >
      <div
        className="mb-[11px] grid h-[38px] w-[38px] place-items-center rounded-[9px]"
        style={{ background: "#e8f1fb", color: BLUE }}
      >
        {icon}
      </div>
      <h3 className="mb-1 font-display text-[15px] font-semibold" style={{ color: "#16203a" }}>
        {title}
      </h3>
      <p className="text-[12.5px] leading-snug" style={{ color: "#6b7488" }}>
        {text}
      </p>
    </div>
  );
}

export function SiteMock({ page = "home", device = "desktop" }: { page?: SitePageKey; device?: Device }) {
  const c = PAGE_CONTENT[page];
  const mobile = device === "mobile";

  return (
    <div style={{ color: "#1c2030", background: "#fff" }}>
      {/* sticky nav */}
      <div
        className="sticky top-0 z-[2] flex items-center justify-between border-b px-[26px] py-[14px]"
        style={{ borderColor: "#eef0f5", background: "#fff" }}
      >
        <div className="flex items-center gap-[9px] font-display text-[15px] font-bold" style={{ color: NAVY }}>
          <span
            className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-[12px] text-white"
            style={{ background: "linear-gradient(135deg,#0e63c4,#1a8fe0)" }}
          >
            RP
          </span>
          Rivertown Plumbing
        </div>
        {!mobile && (
          <div className="flex items-center gap-5 text-[13px] font-medium" style={{ color: "#56607a" }}>
            <span>Services</span>
            <span>About</span>
            <span>Reviews</span>
            <span>Contact</span>
            <span className="rounded-[7px] px-[14px] py-[7px] font-semibold text-white" style={{ background: BLUE }}>
              Book a visit
            </span>
          </div>
        )}
      </div>

      {/* hero */}
      <div
        className={cn(
          "grid items-center gap-6 px-[26px] py-10",
          mobile ? "grid-cols-1 gap-4 px-[18px] py-6" : "grid-cols-[1.05fr_0.95fr]",
        )}
      >
        <div>
          <h1
            className="font-display font-extrabold leading-[1.08] tracking-[-0.03em]"
            style={{ color: NAVY, fontSize: mobile ? 23 : 30 }}
          >
            {c.h1}
          </h1>
          <p className="my-3 max-w-[36ch] text-[14px]" style={{ color: "#56607a" }}>
            {c.sub}
          </p>
          <span
            className="inline-flex items-center gap-2 rounded-[9px] px-[18px] py-[11px] text-[14px] font-semibold text-white"
            style={{ background: BLUE }}
          >
            Book a visit
            <ArrowRight size={16} />
          </span>
          <div className="mt-4 flex items-center gap-2 text-[12px]" style={{ color: "#7a839a" }}>
            <span style={{ color: "#f5a623", letterSpacing: 1 }}>★★★★★</span>
            4.9 from 212 Rivertown customers
          </div>
        </div>
        <div
          className="relative flex h-[200px] items-end overflow-hidden rounded-[14px] p-4"
          style={{ background: "linear-gradient(150deg,#0e63c4 0%,#1a8fe0 55%,#5bb8f0 100%)" }}
        >
          <span
            className="relative z-[1] inline-flex items-center gap-[7px] rounded-[8px] px-3 py-[7px] text-[12px] font-semibold"
            style={{ background: "rgba(255,255,255,.92)", color: NAVY }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: "#16a34a" }} />
            On-call now in Rivertown
          </span>
        </div>
      </div>

      {/* lower block */}
      {c.body === "contact" ? (
        <div className="px-[26px] pb-[34px] pt-2">
          <div className="mb-[18px] text-center">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]" style={{ color: NAVY }}>
              Reach us
            </h2>
            <span className="text-[13px]" style={{ color: "#7a839a" }}>
              We reply within the hour during business days.
            </span>
          </div>
          <div className={cn("grid gap-[14px]", mobile ? "grid-cols-1" : "grid-cols-3")}>
            <SvcCard icon={<Phone size={20} />} title="Call us" text="(555) 014-2210, on-call for emergencies day and night." />
            <SvcCard icon={<Mail size={20} />} title="Email" text="hello@rivertownplumbing.com for quotes and scheduling." />
            <SvcCard icon={<MapPin size={20} />} title="Visit" text="48 Mill Street, Rivertown. Open Mon to Sat, 7am to 6pm." />
          </div>
        </div>
      ) : (
        <div className="px-[26px] pb-[34px] pt-2">
          <div className="mb-[18px] text-center">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]" style={{ color: NAVY }}>
              What we fix
            </h2>
            <span className="text-[13px]" style={{ color: "#7a839a" }}>
              Most jobs done in a single visit.
            </span>
          </div>
          <div className={cn("grid gap-[14px]", mobile ? "grid-cols-1" : "grid-cols-3")}>
            <SvcCard icon={<Droplet size={20} />} title="Drains" text="Slow or blocked drains cleared fast, with a camera check so it stays clear." />
            <SvcCard icon={<Flame size={20} />} title="Water Heaters" text="Repairs and new installs for tanks and tankless, hot water back the same day." />
            <SvcCard icon={<AlertTriangle size={20} />} title="Emergency" text="Burst pipes and leaks, no matter the hour. We answer when you call." />
          </div>
        </div>
      )}

      {/* footer */}
      <div
        className={cn(
          "flex items-center justify-between px-[26px] py-[22px] text-[12px]",
          mobile && "flex-col gap-2 text-center",
        )}
        style={{ background: NAVY, color: "#bcd0e8" }}
      >
        <span className="font-display text-[14px] font-semibold text-white">Rivertown Plumbing & Heating</span>
        <span>Licensed & insured · (555) 014-2210</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo data (SAMPLE_*) + zeroed/empty variants (EMPTY_*), same pattern as Social.
// ---------------------------------------------------------------------------

// KPI cards (Overview). `value` is what demo shows; `emptyValue` is the zeroed
// real-session value (kept per-row because "Top page" zeroes to a dash, not 0).
export interface WebsiteKpi {
  label: string;
  value: string;
  emptyValue: string;
  sub?: string;
  delta?: string;
  brand?: boolean;
}

export const SAMPLE_KPIS: WebsiteKpi[] = [
  { label: "Visitors", value: "1,240", emptyValue: "0", delta: "+8%", sub: "vs last month" },
  { label: "Leads from your site", value: "18", emptyValue: "0", delta: "+3", sub: "new this month", brand: true },
  { label: "Avg time on site", value: "1m 12s", emptyValue: "0s", sub: "People are reading, not bouncing" },
  { label: "Top page", value: "Services", emptyValue: "-", sub: "412 views this month" },
];

export const EMPTY_KPIS: WebsiteKpi[] = SAMPLE_KPIS.map((k) => ({
  ...k,
  value: k.emptyValue,
  delta: undefined,
  brand: false,
}));

// Top pages list (Overview).
export interface TopPage {
  name: string;
  views: number;
}

export const SAMPLE_TOP_PAGES: TopPage[] = [
  { name: "Services", views: 412 },
  { name: "Home", views: 388 },
  { name: "Book Now", views: 196 },
  { name: "Reviews", views: 142 },
  { name: "Contact", views: 102 },
];

// Where visitors come from (Overview + Insights bars).
export interface TrafficSource {
  label: string;
  pct: number;
}

export const SAMPLE_SOURCES: TrafficSource[] = [
  { label: "Google search", pct: 61 },
  { label: "Typed it in directly", pct: 22 },
  { label: "Social media", pct: 11 },
  { label: "Other sites", pct: 6 },
];

// Visitor trend (Insights hero bars) + headline numbers.
export const SAMPLE_TREND: number[] = [42, 48, 45, 53, 50, 58, 55, 62, 60, 68, 72, 80];
export const SAMPLE_VISITORS_THIS_MONTH = 1240;
export const SAMPLE_VISITORS_LAST_MONTH = 1148;

// The client's site pages (Pages master-detail). `key` feeds SiteMock content.
export type SitePageKey = "home" | "services" | "about" | "reviews" | "contact" | "book";

export interface SitePage {
  key: SitePageKey;
  name: string;
  // Full address shown in the browser bar, e.g. rivertownplumbing.com/services.
  path: string;
  updated: string;
  views: number;
}

export const SITE_PAGES: SitePage[] = [
  { key: "home", name: "Home", path: WEBSITE_DOMAIN, updated: "April 18, 2026", views: 388 },
  { key: "services", name: "Services", path: `${WEBSITE_DOMAIN}/services`, updated: "May 2, 2026", views: 412 },
  { key: "about", name: "About", path: `${WEBSITE_DOMAIN}/about`, updated: "March 11, 2026", views: 88 },
  { key: "reviews", name: "Reviews", path: `${WEBSITE_DOMAIN}/reviews`, updated: "May 20, 2026", views: 142 },
  { key: "contact", name: "Contact", path: `${WEBSITE_DOMAIN}/contact`, updated: "April 2, 2026", views: 102 },
  { key: "book", name: "Book Now", path: `${WEBSITE_DOMAIN}/book`, updated: "May 8, 2026", views: 196 },
];

// Change requests (Request a Change). Coordinates are stored as percentages of
// the preview width/height (plus page + device) so a pin lands correctly at any
// screen size, matching the persistence model planned for the real build.
export type RequestStatus = "open" | "in_progress" | "done";

export interface ChangeRequest {
  id: string;
  page: SitePageKey;
  device: Device;
  xPct: number;
  yPct: number;
  note: string;
  status: RequestStatus;
  ts: string;
}

export const SEED_REQUESTS: ChangeRequest[] = [
  {
    id: "req-1",
    page: "home",
    device: "desktop",
    xPct: 18,
    yPct: 30,
    note: 'Can we make the headline bigger and add "24/7" so people know we answer at night?',
    status: "open",
    ts: "2 days ago",
  },
  {
    id: "req-2",
    page: "home",
    device: "desktop",
    xPct: 74,
    yPct: 34,
    note: "Please swap this photo for the new one of our van outside the Mill Street shop.",
    status: "open",
    ts: "3 days ago",
  },
  {
    id: "req-3",
    page: "home",
    device: "desktop",
    xPct: 50,
    yPct: 72,
    note: 'Add a "financing available" line under the Water Heaters card.',
    status: "in_progress",
    ts: "4 days ago",
  },
  {
    id: "req-4",
    page: "home",
    device: "desktop",
    xPct: 30,
    yPct: 88,
    note: "Update the phone number in the footer to our new line, (555) 014-2210.",
    status: "done",
    ts: "last week",
  },
];

// Status -> tone + label, reusing the app's shared Tone vocabulary.
export function requestStatusMeta(status: RequestStatus): { tone: Tone; label: string } {
  switch (status) {
    case "in_progress":
      return { tone: "warning", label: "In progress" };
    case "done":
      return { tone: "positive", label: "Done" };
    default:
      return { tone: "brand", label: "Open" };
  }
}
