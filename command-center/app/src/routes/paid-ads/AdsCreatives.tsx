import { useState } from "react";
import { Image as ImageIcon, Megaphone } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights, type AdItem } from "../../lib/adsInsights";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { PAID_ADS_CONTAINER, NotConnectedNotice, PlatformGlyph } from "./shared";
import AdPreviewModal from "../../components/ads/AdPreviewModal";

// "Your Ads": the creatives gallery. Every live ad shown the way people see it,
// with its real ad copy and platform badges. Only the ads running right now
// appear here (paused/finished ads are hidden). Driven by real Meta ads
// (/api/ads/insights); demo shows the sample gallery.

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
  // Only the ads running right now belong in "Your Ads"; paused/finished ones
  // are hidden so the client sees exactly what is live for them today.
  const ads = insights.ads.filter((a) => a.active);
  // The ad opened in the placement-preview modal (null = closed).
  const [preview, setPreview] = useState<AdItem | null>(null);

  return (
    <Shell>
      <div className={PAID_ADS_CONTAINER}>
        <PageBar
          tabs={PAID_ADS_TABS}
          description="Every ad we are running for you right now, exactly as people see it on Instagram and Facebook."
          actions={
            ads.length > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-positive-tint px-3 py-1.5 text-[12.5px] font-semibold text-positive">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                {ads.length} {ads.length === 1 ? "ad" : "ads"} running now
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
              <Panel
                key={ad.id}
                role="button"
                tabIndex={0}
                aria-label={`See how "${ad.headline}" looks across placements`}
                onClick={() => setPreview(ad)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreview(ad);
                  }
                }}
                className="flex cursor-pointer flex-col overflow-hidden p-0 transition-colors hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {/* Creative thumbnail: the real Meta image when we have one,
                    else a deterministic gradient placeholder. */}
                <div
                  className="relative flex h-[148px] items-end bg-surface-2 p-3 text-white"
                  style={{
                    backgroundImage: ad.thumbnailUrl ? `url("${ad.thumbnailUrl}")` : thumbFor(i),
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <span
                    className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white"
                    style={{ backgroundColor: "#16a34a", boxShadow: "0 4px 10px rgba(22,163,74,.35)" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Live
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

        <AdPreviewModal ad={preview} onClose={() => setPreview(null)} />
      </div>
    </Shell>
  );
}
