import { Star, Link2 } from "lucide-react";
import { Panel, Button } from "../../components/ui";
import { PAGE_CONTAINER } from "../../lib/layout";

// Shared bits for the Google Reviews surfaces. Same golden rule as Social: a real
// (connected) client must never see fabricated content. Pages render their
// designed, populated layout only in demo/preview mode (`?demo=1`); in a real
// session they show the empty / zeroed state plus <NotConnectedNotice/> until the
// Google Business Profile is linked through GHL.

// A row of stars for a rating (supports halves). Gold is reserved for ratings and
// money, never decorative (see index.css --ledger / --star usage).
export function StarRating({
  value,
  size = 15,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const isHalf = i === full && half;
        return (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-border-strong" strokeWidth={1.5} />
            {(filled || isHalf) && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={isHalf ? { width: size / 2 } : undefined}
              >
                <Star
                  size={size}
                  strokeWidth={1.5}
                  style={{ color: "var(--star)", fill: "var(--star)" }}
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// A compact rating chip: gold star + number. For inline use beside a name/date.
export function RatingBadge({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold tnum text-text ${className}`}
    >
      <Star size={12} style={{ color: "var(--star)", fill: "var(--star)" }} />
      {value.toFixed(1)}
    </span>
  );
}

// The standing "Google profile is not linked yet" banner. Shown on every Reviews
// surface in a real session so the empty state is never mistaken for a bug.
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="mb-4 flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
      <Link2 size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">Not connected yet.</span>{" "}
        {message ??
          "To see your real reviews and rating, we still need to connect your Google Business Profile through GoHighLevel."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect Google (coming soon)
      </Button>
    </Panel>
  );
}

// Shared scroll container for a Reviews page (matches the Social container).
export const REVIEWS_CONTAINER = PAGE_CONTAINER;

// Color used for review stars. Defined here as a fallback in case the token is
// ever read in JS; the CSS token lives in index.css.
export const STAR_COLOR = "var(--star)";
