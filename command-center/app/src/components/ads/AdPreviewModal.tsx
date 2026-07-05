import { useEffect } from "react";
import { X, Info } from "lucide-react";
import type { AdItem } from "../../lib/adsInsights";
import { PlatformGlyph } from "../../routes/paid-ads/shared";

// Placement preview for a single ad. Meta's live /previews endpoint returns an
// iframe whose URL embeds our shared System-User token, so rendering it in the
// client would leak that token to every browser. Until a safe server-proxied
// render exists, this shows the ad's real creative and copy framed in each
// placement it runs (feed / story / reel), with an honest note that the fully
// interactive Meta preview is on the way. No fabricated creative: an ad with no
// image falls back to a neutral panel.
// TODO(paid-ads): add a server-proxied /api/ads/preview that renders Meta's
// previews without exposing META_SYSTEM_USER_TOKEN to the client.

const THUMB_FALLBACK = "linear-gradient(135deg,#4f46e5,#7c73f0 60%,#db2777)";

interface Placement {
  key: string;
  label: string;
  // Frame aspect: feed cards are squareish, stories/reels are tall 9:16.
  ratio: string;
}

const PLACEMENTS: Placement[] = [
  { key: "fb-feed", label: "Facebook feed", ratio: "4 / 5" },
  { key: "ig-feed", label: "Instagram feed", ratio: "1 / 1" },
  { key: "story", label: "Story", ratio: "9 / 16" },
  { key: "reel", label: "Reel", ratio: "9 / 16" },
];

function PlacementFrame({ ad, placement }: { ad: AdItem; placement: Placement }) {
  const bg = ad.thumbnailUrl
    ? { backgroundImage: `url("${ad.thumbnailUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: THUMB_FALLBACK };
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11.5px] font-semibold text-faint">{placement.label}</div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
        <div className="w-full" style={{ aspectRatio: placement.ratio, ...bg }} />
        <div className="p-3">
          <div className="text-[12.5px] font-bold text-text">{ad.headline}</div>
          {ad.copy && <p className="mt-1 line-clamp-3 text-[11.5px] leading-snug text-muted">{ad.copy}</p>}
        </div>
      </div>
    </div>
  );
}

export default function AdPreviewModal({ ad, onClose }: { ad: AdItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!ad) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ad, onClose]);

  if (!ad) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:max-w-3xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[16px] text-text">{ad.headline}</h2>
            <div className="mt-1 flex items-center gap-1.5">
              {ad.platforms.map((p) => (
                <PlatformGlyph key={p} p={p} size={15} />
              ))}
              <span className="text-[12.5px] text-faint">How this ad looks in each spot</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-faint transition-colors hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand-tint p-3 text-[12.5px] leading-snug text-text">
            <Info size={16} className="mt-0.5 shrink-0 text-brand-text" />
            <span>
              A preview of where your ad appears across Facebook and Instagram. Fully interactive
              placement previews are coming soon.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {PLACEMENTS.map((p) => (
              <PlacementFrame key={p.key} ad={ad} placement={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
