import { Image as ImageIcon, Megaphone } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights } from "../../lib/adsInsights";
import { formatCompact, formatNumber } from "../../lib/format";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { PAID_ADS_CONTAINER, NotConnectedNotice, PlatformGlyph } from "./shared";

// "Your Ads": the creatives gallery. Every ad shown the way people see it, with
// the real ad copy and plain per-ad stats (leads, people reached). Driven by
// real Meta ads (/api/ads/insights); demo shows the sample gallery.

// Deterministic gradient placeholder per ad (Meta ads carry a real thumbnail we
// don't hotlink yet; a stable gradient keeps the card looking intentional).
const THUMBS = [
  "linear-gradient(135deg,#4f46e5,#7c73f0 60%,#db2777)",
  "linear-gradient(135deg,#0ea5e9,#4f46e5)",
  "linear-gradient(135deg,#0f172a,#334155 70%,#0ea5e9)",
  "linear-gradient(135deg,#f59e0b,#db2777)",
  "linear-gradient(135deg,#16a34a,#0ea5e9)",
];
function thumbFor(i: number): string {
  return THUMBS[i % THUMBS.length];
}

export default function AdsCreatives() {
  const { session } = useAuth();
  const { data } = useAdsInsights(Boolean(session));
  const insights = data ?? emptyAdsInsights(false);
  const ads = insights.ads;
  const activeCount = ads.filter((a) => a.active).length;
  const pausedCount = ads.length - activeCount;
  const maxLeads = Math.max(...ads.map((a) => a.leads), 1);
  const maxReach = Math.max(...ads.map((a) => a.reach), 1);

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="Every ad we are running for you, exactly as people see it on Instagram and Facebook."
          actions={
            ads.length > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-positive-tint px-3 py-1.5 text-[12.5px] font-semibold text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {activeCount} active, {pausedCount} paused
              </span>
            ) : undefined
          }
        />

        {!insights.configured && (
          <NotConnectedNotice message="Once your Meta ad account is connected, every ad we run for you shows up here with its copy and results." />
        )}

        {ads.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ads.map((ad, i) => (
              <Panel key={ad.id} className="flex flex-col overflow-hidden p-0">
                {/* Creative thumbnail (placeholder gradient) */}
                <div
                  className="relative flex h-[148px] items-end p-3 text-white"
                  style={{ backgroundImage: thumbFor(i) }}
                >
                  <span
                    className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                      ad.active ? "text-white" : "bg-[#e9ebf2] text-[#7a7f90]"
                    }`}
                    style={ad.active ? { backgroundColor: "#16a34a", boxShadow: "0 4px 10px rgba(22,163,74,.35)" } : undefined}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {ad.active ? "Active" : "Paused"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11.5px] font-semibold backdrop-blur-sm">
                    <ImageIcon size={13} />
                    Ad creative
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-4">
                  <div className="font-display text-[15px] font-bold tracking-tight text-text">{ad.headline}</div>
                  {ad.copy && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">"{ad.copy}"</p>}

                  <div className="mt-3 flex gap-2">
                    {ad.platforms.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                        <PlatformGlyph p={p} size={16} />
                        {p === "ig" ? "Instagram" : "Facebook"}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex gap-3.5 border-t border-divider pt-3.5">
                    <div className="flex-1">
                      <div className="font-display text-[18px] font-bold tracking-tight text-brand-text tnum">{formatNumber(ad.leads)}</div>
                      <div className="mt-0.5 text-[11px] text-faint">leads from this ad</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full" style={{ width: `${(ad.leads / maxLeads) * 100}%`, backgroundImage: "var(--grad-brand)" }} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-[18px] font-bold tracking-tight text-text tnum">{formatCompact(ad.reach)}</div>
                      <div className="mt-0.5 text-[11px] text-faint">people reached</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full" style={{ width: `${(ad.reach / maxReach) * 100}%`, backgroundImage: "linear-gradient(90deg,#7dd3fc,#0ea5e9)" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Megaphone size={22} />}
              title={insights.configured ? "No ads running yet" : "No ads to show yet"}
              description={
                insights.configured
                  ? "Every ad we run for you appears here with its copy and results once campaigns start."
                  : "After your accounts are linked, every ad we run for you appears here with its copy and results."
              }
            />
          </Panel>
        )}
      </div>
    </Shell>
  );
}
