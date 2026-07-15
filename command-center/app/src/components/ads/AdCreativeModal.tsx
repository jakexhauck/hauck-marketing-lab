import { useEffect } from "react";
import { X, Play } from "lucide-react";
import type { AdItem } from "../../lib/adsInsights";
import { useAdVideoSource } from "../../hooks/useAdVideo";
import { PlatformGlyph } from "../../routes/paid-ads/shared";

// A simple lightbox: show the ad's real creative big. Image ads render the
// image; video ads play the resolved mp4 (poster while it loads). No fabricated
// media: an ad with no creative shows a neutral panel; a video with no
// resolvable source shows its poster plus a Facebook watch link.
export default function AdCreativeModal({ ad, onClose }: { ad: AdItem | null; onClose: () => void }) {
  const isVideo = ad?.mediaType === "video" && Boolean(ad?.videoId);
  const { data: video } = useAdVideoSource(isVideo ? ad?.videoId : undefined);

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
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[16px] text-text">{ad.headline}</h2>
            <div className="mt-1 flex items-center gap-1.5">
              {ad.platforms.map((p) => (
                <PlatformGlyph key={p} p={p} size={15} />
              ))}
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

        <div className="flex-1 overflow-y-auto">
          {/* The creative, full and uncropped, on a dark stage. */}
          <div className="flex items-center justify-center bg-slate-950 p-3">
            {isVideo && video?.source ? (
              <video
                src={video.source}
                poster={ad.thumbnailUrl || undefined}
                controls
                autoPlay
                playsInline
                className="max-h-[70vh] w-auto max-w-full rounded-lg"
              />
            ) : ad.thumbnailUrl ? (
              <img
                src={ad.thumbnailUrl}
                alt={ad.headline}
                className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex aspect-[4/5] w-full max-w-sm items-center justify-center rounded-lg bg-surface-2 text-faint">
                No preview available
              </div>
            )}
          </div>

          {isVideo && !video?.source && video?.permalink && (
            <a
              href={video.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-5 mb-4 mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand/40"
            >
              <Play size={14} /> Watch on Facebook
            </a>
          )}

          {ad.copy && (
            <p className="whitespace-pre-line px-5 pb-5 pt-4 text-[13px] leading-relaxed text-muted">{ad.copy}</p>
          )}
        </div>
      </div>
    </div>
  );
}
