import { useState } from "react";
import { Megaphone, Play } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { Panel, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useAdsInsights } from "../../hooks/useAdsInsights";
import { emptyAdsInsights, type AdItem } from "../../lib/adsInsights";
import { PAID_ADS_TABS } from "../../lib/pageTabs";
import { PAID_ADS_CONTAINER, NotConnectedNotice, PlatformGlyph } from "./shared";
import AdCreativeModal from "../../components/ads/AdCreativeModal";

// "Your Ads": the creatives gallery. Every live ad shown as the real creative,
// uncropped, exactly what people see on Instagram and Facebook. No ad names or
// internal labels: just the creative. Video ads show a crisp poster with a play
// badge and play in the lightbox on click. Driven by real Meta ads
// (/api/ads/insights); demo shows the sample gallery.

// Deterministic gradient placeholder for the rare ad with no resolvable creative
// (keeps the card intentional rather than blank).
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
  // The ad opened in the creative lightbox (null = closed).
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
          <NotConnectedNotice message="Once your Meta ad account is connected, every ad we run for you shows up here exactly as people see it." />
        )}

        {ads.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map((ad, i) => {
              const isVideo = ad.mediaType === "video";
              return (
                <Panel
                  key={ad.id}
                  role="button"
                  tabIndex={0}
                  aria-label="Open ad creative"
                  onClick={() => setPreview(ad)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreview(ad);
                    }
                  }}
                  className="group relative aspect-[4/5] cursor-pointer overflow-hidden bg-slate-900 p-0 transition-colors hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {/* The whole creative, uncropped. A blurred cover of the same
                      image fills the frame behind a contain-fit copy, so any
                      aspect ratio (portrait video, square, landscape) reads
                      cleanly with nothing sliced off. No names or labels. */}
                  {ad.thumbnailUrl ? (
                    <>
                      <div
                        aria-hidden
                        className="absolute inset-0 scale-110 blur-xl"
                        style={{
                          backgroundImage: `url("${ad.thumbnailUrl}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      />
                      <div className="absolute inset-0 bg-slate-950/30" />
                      <img
                        src={ad.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    </>
                  ) : (
                    <div className="absolute inset-0" style={{ backgroundImage: thumbFor(i) }} />
                  )}

                  {/* Live tag */}
                  <span
                    className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold text-white"
                    style={{ backgroundColor: "#16a34a", boxShadow: "0 4px 10px rgba(22,163,74,.35)" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    Live
                  </span>

                  {/* Platform icons, subtle overlay bottom-left. No text. */}
                  <span className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5">
                    {ad.platforms.map((p) => (
                      <PlatformGlyph key={p} p={p} size={18} />
                    ))}
                  </span>

                  {/* Video play affordance */}
                  {isVideo && (
                    <span className="absolute inset-0 z-10 flex items-center justify-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
                        <Play size={24} className="ml-0.5 fill-current" />
                      </span>
                    </span>
                  )}
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel className="px-4 py-12">
            <EmptyState
              icon={<Megaphone size={22} />}
              title={insights.configured ? "No ads running yet" : "No ads to show yet"}
              description={
                insights.configured
                  ? "Every ad we run for you appears here, exactly as people see it."
                  : "After your accounts are linked, every ad we run for you appears here, exactly as people see it."
              }
            />
          </Panel>
        )}

        <AdCreativeModal ad={preview} onClose={() => setPreview(null)} />
      </div>
    </Shell>
  );
}
