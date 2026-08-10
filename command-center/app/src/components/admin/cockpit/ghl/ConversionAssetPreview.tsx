import { useState } from "react";
import { Eye, Monitor, Smartphone } from "lucide-react";
import type { ConversionAsset } from "../../../../../functions/lib/conversionAssets";
import {
  previewClose,
  previewCoupon,
  previewHeadline,
  previewMedia,
  previewPalette,
  previewReview,
  previewTrust,
} from "../../../../lib/conversionAssetPreview";

// The asset page, drawn from the draft as the wizard is filled in.
//
// This is a SKETCH, not the build. It exists so the operator can see the shape
// of what they are specifying: that a before/after pair is the right way round,
// that their accent colour is readable behind the CTA, that the page has a
// photo in it at all. The real page is built later by the conversion-asset
// skill and will not look exactly like this.
//
// Everything inside the device frame uses inline colours, because those colours
// belong to the CLIENT and must not be pulled from our admin theme. Everything
// outside it uses our tokens. The boundary is the frame.

const PHONE_WIDTH = 300;
const DESKTOP_WIDTH = 520;

// The Studio accent. Exported because the wizard scopes --brand to it, so the
// form's controls and this pane's chrome are the same cyan without either side
// hardcoding the other's colour.
//
// The foreground is DARK on purpose: this cyan is a light fill and white text
// on it lands at 2.2:1. Dark ink is 7.7:1.
export const STUDIO_ACCENT = "#31c8d4";
export const STUDIO_ACCENT_FG = "#06272b";

export default function ConversionAssetPreview({
  draft,
  clientName,
}: {
  draft: ConversionAsset;
  clientName: string;
}) {
  const [wide, setWide] = useState(false);

  const palette = previewPalette(draft);
  const media = previewMedia(draft);
  const close = previewClose(draft);
  const coupon = previewCoupon(draft);
  const review = previewReview(draft);
  const trust = previewTrust(draft);

  return (
    // The right half of the wizard frame. It owns its own header bar rather
    // than floating a label above itself, so the two panes read as one panel
    // split down the middle instead of two cards that happen to be adjacent.
    <div className="flex min-w-0 flex-1 flex-col border-t border-border bg-bg xl:border-t-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <Eye className="h-3.5 w-3.5 text-brand" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
          Live preview
        </span>
        <div className="ml-auto flex gap-0.5 rounded-[var(--radius)] border border-border bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setWide(false)}
            aria-pressed={!wide}
            aria-label="Preview at phone width"
            className={`rounded-[calc(var(--radius)-2px)] px-2 py-1 transition-colors ${
              wide ? "text-muted hover:text-text" : "bg-brand text-brand-fg"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setWide(true)}
            aria-pressed={wide}
            aria-label="Preview at desktop width"
            className={`rounded-[calc(var(--radius)-2px)] px-2 py-1 transition-colors ${
              wide ? "bg-brand text-brand-fg" : "text-muted hover:text-text"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* min-h-0 so this scrolls inside the frame instead of stretching it: the
          panel is pinned to the viewport height at xl and a tall preview must
          not be what decides how tall the whole wizard is. */}
      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-5">
        <div
          className="h-fit shrink-0 overflow-hidden rounded-lg shadow-[0_18px_40px_-12px_rgba(0,0,0,.55)]"
          style={{
            width: wide ? DESKTOP_WIDTH : PHONE_WIDTH,
            background: palette.paper,
            color: palette.ink,
          }}
        >
          <div className="px-4 pt-4 pb-3" style={{ background: palette.hero, color: palette.onHero }}>
            {draft.logoUrl ? (
              <img
                src={draft.logoUrl}
                alt=""
                className="mb-2 h-5 w-auto object-contain object-left"
                style={{ maxWidth: "60%" }}
              />
            ) : (
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] opacity-75">
                {clientName || "Your client"}
              </div>
            )}
            <h4 className="m-0 text-[16px] font-bold leading-[1.25] tracking-[-0.01em]">
              {previewHeadline(draft)}
            </h4>
          </div>

          <Media media={media} palette={palette} />

          <div className="px-4 pt-3 pb-4">
            <p className="m-0 mb-3 text-[11px] leading-[1.5] opacity-70">
              {draft.kind === "owner-story"
                ? "Their story, written from your notes."
                : draft.kind === "unique-mechanism"
                  ? "Why this process is not what everyone else does."
                  : "A line about the work, then the proof."}
            </p>

            {/* The gift the text promised. Drawn before the CTA because a lead
                who came for a discount should not have to hunt for it. */}
            {coupon && (
              <div
                className="mb-3 rounded-md px-3 py-2.5 text-center"
                style={{ border: `1px dashed ${palette.accent}` }}
              >
                <span className="block text-[13px] font-bold" style={{ color: palette.accent }}>
                  {coupon.offer}
                </span>
                {coupon.code && (
                  <span className="mt-1 block font-mono text-[10px] font-bold tracking-[0.14em] opacity-70">
                    {coupon.code}
                  </span>
                )}
                {coupon.terms && (
                  <span className="mt-1 block text-[9px] opacity-50">{coupon.terms}</span>
                )}
              </div>
            )}

            {trust.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {trust.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                    style={{ background: palette.accent, color: palette.onAccent }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}

            {review && (
              <div
                className="mb-3 rounded-md px-3 py-2.5 text-[10px] leading-[1.5]"
                style={{ background: "rgba(0,0,0,.045)" }}
              >
                <p className="m-0 italic opacity-80">
                  {/* Trimmed hard: the preview shows that a review IS there and
                      roughly how much room it takes, not the whole quote. */}
                  {review.text.length > 120 ? `${review.text.slice(0, 120)}...` : review.text}
                </p>
                {(review.name || review.stars > 0) && (
                  <p className="m-0 mt-1.5 text-[9px] font-bold opacity-60">
                    {review.stars > 0 && `${"★".repeat(review.stars)} `}
                    {review.name}
                  </p>
                )}
              </div>
            )}

            {close.kind === "book" ? (
              <>
                <div
                  className="rounded-md px-3 py-2.5 text-center text-[12px] font-bold"
                  style={{ background: palette.accent, color: palette.onAccent }}
                >
                  {close.cta}
                </div>
                <div
                  className="mt-3 rounded-md px-3 py-4 text-center text-[10px]"
                  style={{
                    border: `1px ${close.hasCalendar ? "solid" : "dashed"} rgba(0,0,0,.18)`,
                    opacity: close.hasCalendar ? 0.75 : 0.45,
                  }}
                >
                  {close.hasCalendar ? "Their calendar, embedded here" : "No calendar added yet"}
                </div>
              </>
            ) : (
              /* The trust page ends here. No button and no calendar, because
                 the lead already booked: this block is the whole reason the
                 booking step does not exist for this asset. */
              <div
                className="rounded-md px-3 py-3 text-[10px] leading-[1.5]"
                style={{ border: "1px solid rgba(0,0,0,.14)", opacity: 0.75 }}
              >
                <span className="block text-[9px] font-bold uppercase tracking-[0.12em] opacity-60">
                  What to expect
                </span>
                <span className="mt-1 block">
                  What happens at the estimate, how long it takes, what to have ready.
                </span>
              </div>
            )}

            <div className="mt-3 text-center text-[9px] tracking-[0.08em] opacity-40">
              {draft.slug ? `/${draft.slug}` : "/your-page-url"}
            </div>
          </div>
        </div>
      </div>

      {/* Said out loud, because a neutral grey page could otherwise be mistaken
          for the client's actual brand. */}
      {!palette.known && (
        <p className="border-t border-border px-4 py-3 text-[11.5px] text-muted">
          {draft.designSource === "kit"
            ? "Colours come from the design kit, which nothing has read yet. The greys are ours."
            : draft.designSource === "website" && draft.colorSource === "website"
              ? "Colours get pulled from their website at build time. The greys are ours."
              : "No colours picked yet, so this is drawn in neutral greys."}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Media({
  media,
  palette,
}: {
  media: ReturnType<typeof previewMedia>;
  palette: ReturnType<typeof previewPalette>;
}) {
  switch (media.kind) {
    // No photograph, because this page has none to show. Three numbered steps
    // is what a mechanism page actually looks like, and drawing an empty photo
    // well here would suggest an asset somebody still has to go and find.
    case "steps":
      return (
        <div className="px-4 py-3">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] opacity-45">
            {media.name || "The unnamed method"}
          </span>
          <div className="mt-2 flex flex-col gap-1.5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-2">
                <span
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold"
                  style={{ background: palette.accent, color: palette.onAccent }}
                >
                  {n}
                </span>
                <span
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${74 - n * 12}%`,
                    background: "rgba(0,0,0,.09)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      );

    case "portrait":
      return (
        <div className="h-28">
          <Well url={media.photo} label="Owner photo" />
        </div>
      );

    case "grid":
      return (
        <div className="grid grid-cols-3 gap-0.5">
          {media.photos.map((url, i) => (
            <div key={i} className="h-16">
              <Well url={url} label="" />
            </div>
          ))}
        </div>
      );
  }
}

// One image well. Filled it is the photo; empty it names the slot it is
// waiting for, so the hole says what goes in it.
function Well({ url, label }: { url: string | null; label: string }) {
  if (url) {
    return <img src={url} alt="" className="h-full w-full flex-1 object-cover" />;
  }
  return (
    <div
      className="grid h-full w-full flex-1 place-items-center text-[9px] font-bold uppercase tracking-[0.12em]"
      style={{
        background:
          "repeating-linear-gradient(45deg, rgba(0,0,0,.05) 0 8px, rgba(0,0,0,.02) 8px 16px)",
        color: "rgba(0,0,0,.35)",
      }}
    >
      {label}
    </div>
  );
}
