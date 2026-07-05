import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Mail, Eye, Clock, FileText, ExternalLink, SquarePen, Globe, BarChart3 } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { WEBSITE_TABS } from "../../lib/pageTabs";
import { Panel, PanelHeader, Button, EmptyState } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useClient } from "../../context/ClientContext";
import { useWebsiteAnalytics, formatDuration } from "../../hooks/useWebsiteAnalytics";
import { cn } from "../../lib/cn";
import {
  WEBSITE_CONTAINER,
  WEBSITE_DOMAIN,
  NotConnectedNotice,
  BrowserFrame,
  SiteMock,
  LiveSiteFrame,
  DeviceToggle,
  SAMPLE_KPIS,
  EMPTY_KPIS,
  SAMPLE_TOP_PAGES,
  SAMPLE_SOURCES,
  SAMPLE_VISITORS_THIS_MONTH,
  SITE_PAGES,
  type WebsiteKpi,
  type Device,
} from "./shared";

// Website > Overview (the storefront glance). The live site is the hero: a large
// browser preview with a "Live" badge and floating stat chips, then the headline
// numbers and where the work is coming from. Golden rule (see ./shared): the
// populated layout shows only in demo/preview; a real session sees zeroed cards,
// a neutral placeholder preview, and <NotConnectedNotice/>.

// KPI icons line up with the order of SAMPLE_KPIS in ./shared
// (Visitors, Leads from your site, Avg time on site, Top page).
const KPI_ICONS = [Users, Mail, Clock, FileText];
// Real (GA4) KPI order: Visitors, Page views, Avg time on site, Top page.
const REAL_KPI_ICONS = [Users, Eye, Clock, FileText];

// Neutral placeholder shown inside the browser frame before the site is connected.
function PreviewPlaceholder() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "#eef0f5" }}>
        <Globe size={22} style={{ color: "#8a90a3" }} />
      </div>
      <p className="text-[14px] font-semibold" style={{ color: "#14161f" }}>
        Your website preview will appear here
      </p>
      <p className="max-w-[42ch] text-[13px] leading-snug" style={{ color: "#6b7488" }}>
        Once we connect your site, you will see it live in this window, exactly as your customers do.
      </p>
    </div>
  );
}

export default function WebsiteOverview() {
  const demo = demoMode();
  const { client } = useClient();
  const websiteUrl = client.websiteUrl;
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device>("desktop");
  const mobile = device === "mobile";

  // Real GA4 numbers (real sessions only; demo short-circuits the hook).
  const analytics = useWebsiteAnalytics();
  const a = analytics.data;
  const aConnected = analytics.connected && Boolean(a);

  // Real KPI tiles from GA4, in REAL_KPI_ICONS order.
  const realKpis: WebsiteKpi[] = a
    ? [
        {
          label: "Visitors",
          value: a.visitorsThisMonth.toLocaleString(),
          emptyValue: "0",
          delta: a.deltaPct != null && a.deltaPct >= 0 ? `+${a.deltaPct}%` : undefined,
          sub: "vs last month",
        },
        { label: "Page views", value: a.pageViews.toLocaleString(), emptyValue: "0", sub: "this month" },
        {
          label: "Avg time on site",
          value: formatDuration(a.avgTimeOnSiteSec),
          emptyValue: "0s",
          sub: "per visit",
        },
        {
          label: "Top page",
          value: a.topPage?.label ?? "-",
          emptyValue: "-",
          brand: true,
          sub: a.topPage ? `${a.topPage.views.toLocaleString()} views this month` : undefined,
        },
      ]
    : [];

  // What the KPI row + panels show: demo fixtures, real GA4 data, or zeroed.
  const showData = demo || aConnected;
  const kpis = demo ? SAMPLE_KPIS : aConnected ? realKpis : EMPTY_KPIS;
  const kpiIcons = aConnected && !demo ? REAL_KPI_ICONS : KPI_ICONS;

  // Top pages + traffic sources, unified across demo fixtures and real GA4 data.
  const topPagesList = demo
    ? SAMPLE_TOP_PAGES.map((p) => ({ name: p.name, views: p.views }))
    : aConnected
      ? (a?.topPages ?? []).map((p) => ({ name: p.label, views: p.views }))
      : [];
  const sourcesList = demo ? SAMPLE_SOURCES : aConnected ? a?.sources ?? [] : [];

  // The site is "connected" in demo (SiteMock) or when the client has a real URL.
  const connected = demo || Boolean(websiteUrl);
  // Address-bar label: the demo's fixed domain, or the client's real domain.
  const displayDomain = websiteUrl
    ? websiteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : WEBSITE_DOMAIN;
  const liveHref = demo ? `https://${WEBSITE_DOMAIN}` : websiteUrl ?? "";

  return (
    <Shell>
      <div className={WEBSITE_CONTAINER}>
        <PageBar
          tabs={WEBSITE_TABS}
          description="Your storefront is open. This is your live website, the first thing most Rivertown customers see before they ever call."
          actions={
            <>
              <Button
                variant="secondary"
                size="md"
                className="hidden sm:inline-flex"
                onClick={() => navigate("/marketing/website/request")}
              >
                <SquarePen size={16} /> Request a change
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!connected}
                onClick={() => liveHref && window.open(liveHref, "_blank", "noopener")}
              >
                <ExternalLink size={16} /> View live site
              </Button>
            </>
          }
        />

        {!demo && !aConnected && !websiteUrl && (
          <NotConnectedNotice message="Everything below reads 0 because your site is not linked yet. Once we connect it, this page fills in with your real visitors, pages, and leads." />
        )}
        {!demo && !aConnected && websiteUrl && (
          <Panel className="mb-4 flex items-center gap-3 border-brand/30 bg-brand-tint p-4">
            <BarChart3 size={18} className="shrink-0 text-brand-text" />
            <div className="text-[13px] leading-snug text-text">
              <span className="font-semibold">Your site is connected.</span> Visitor
              numbers appear here once your website analytics are linked.
            </div>
          </Panel>
        )}

        {/* Storefront hero: the live site, front and centre */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="hidden text-[13px] text-muted sm:block">
            {connected
              ? "A live look at your homepage, exactly as visitors see it."
              : "A preview of your homepage will appear here once your site is connected."}
          </p>
          <DeviceToggle value={device} onChange={setDevice} className="ml-auto" />
        </div>

        <div className={cn("relative mb-8", mobile && "mx-auto w-full max-w-[390px]")}>
          {/* Live badge: shown whenever a real (or demo) site is on screen. */}
          {connected && (
            <span
              className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur"
              style={{ background: "rgba(20,22,31,.82)" }}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: "#e5484d" }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "#e5484d" }} />
              </span>
              Live
            </span>
          )}

          {/* Floating glass stat chips carry fabricated numbers, so demo only. */}
          {demo && !mobile && (
            <>
              <HeroChip className="-top-4 right-5 hidden md:block" n={SAMPLE_VISITORS_THIS_MONTH.toLocaleString()} l="visitors this month" />
              <HeroChip className="top-1/2 -left-4 hidden -translate-y-1/2 lg:block" n={SAMPLE_KPIS[1].value} l="leads from the site" />
              <HeroChip className="-bottom-4 right-16 hidden md:block" n={String(SITE_PAGES.length)} l="pages live" />
            </>
          )}

          <BrowserFrame url={demo ? WEBSITE_DOMAIN : displayDomain} device={device}>
            {demo ? (
              <SiteMock page="home" device={device} />
            ) : websiteUrl ? (
              <LiveSiteFrame url={websiteUrl} device={device} />
            ) : (
              <PreviewPlaceholder />
            )}
          </BrowserFrame>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => {
            const Icon = kpiIcons[i];
            return (
              <Panel key={k.label} className="p-4">
                <div className="flex items-center gap-2 text-[12.5px] text-faint">
                  <Icon size={14} className="shrink-0 text-brand" />
                  <span className="truncate">{k.label}</span>
                </div>
                <div
                  className={cn(
                    "mt-2.5 font-data text-[26px] font-semibold leading-none tnum",
                    k.brand && showData ? "text-brand-text" : showData ? "text-text" : "text-faint",
                  )}
                >
                  {k.value}
                </div>
                {(k.delta || k.sub) && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-muted">
                    {k.delta && (
                      <span className="inline-flex items-center rounded-full bg-positive-tint px-1.5 py-0.5 text-[11px] font-semibold text-positive">
                        {k.delta}
                      </span>
                    )}
                    {k.sub && <span className="truncate">{k.sub}</span>}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>

        {/* Top pages + where visitors come from */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel className="overflow-hidden">
            <PanelHeader title="Top pages" />
            {topPagesList.length > 0 ? (
              <ul className="px-4 py-1">
                {topPagesList.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex items-center justify-between gap-3 border-b border-divider py-2.5 text-[13.5px] last:border-b-0"
                  >
                    <span className="flex min-w-0 items-center gap-2.5 font-medium text-text">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[6px] bg-surface-2 font-data text-[11px] font-bold text-faint">
                        {i + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="shrink-0 font-data text-[12.5px] font-semibold tnum text-muted">
                      {p.views.toLocaleString()} views
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<FileText size={22} />}
                  title="No page data yet"
                  description="Once your site is connected, your most-visited pages show up here."
                />
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Where visitors come from" />
            {sourcesList.length > 0 ? (
              <div className="flex flex-col gap-3.5 p-4">
                {sourcesList.map((s) => (
                  <div key={s.label}>
                    <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                      <span className="text-text">{s.label}</span>
                      <span className="font-data font-semibold tnum text-muted">{s.pct}%</span>
                    </div>
                    <div className="h-[9px] overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s.pct}%`, backgroundImage: "var(--grad-brand)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<BarChart3 size={22} />}
                  title="No traffic data yet"
                  description="After your site is linked, you will see where your visitors are coming from."
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

// Floating glass stat chip on the hero. Colours are hardcoded (like SiteMock) so
// the chip stays readable wherever it floats, independent of the app theme.
function HeroChip({ n, l, className }: { n: string; l: string; className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 rounded-[12px] border px-3.5 py-2.5 shadow-[var(--shadow-md)] backdrop-blur",
        className,
      )}
      style={{ background: "rgba(255,255,255,.82)", borderColor: "rgba(255,255,255,.6)" }}
    >
      <div className="font-display text-[18px] font-bold leading-none tracking-[-0.02em]" style={{ color: "#14161f" }}>
        {n}
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "#555a6b" }}>
        {l}
      </div>
    </div>
  );
}
