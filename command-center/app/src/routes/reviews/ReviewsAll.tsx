import { useMemo, useState } from "react";
import { MessageSquare, Sparkles, Check, RefreshCw, Star } from "lucide-react";
import Shell from "../../components/Shell";
import { Panel, Badge, Button, EmptyState, Segmented, type SegmentOption } from "../../components/ui";
import PageBar from "../../components/PageBar";
import { REVIEWS_TABS } from "../../lib/pageTabs";
import { demoMode } from "../../demo/demoMode";
import { StarRating, ReviewsComingSoon, REVIEWS_CONTAINER } from "./shared";

// The "All Reviews" surface of Google Reviews: an inbox-style work queue. A
// persistent segmented filter bar sits above a tight, scannable list of review
// rows, each with an inline reply drawer holding a suggested (AI-drafted) reply.
//
// Same golden rule as the rest of the Reviews + Social surfaces: a real, connected
// client must never see fabricated reviews. The populated, designed queue renders
// only in demo/preview mode. In a real session (demo === false) there is no live
// reviews backend yet (that lands in Phase 2), so the real state is intentionally
// empty: a not-connected notice plus an empty state until the Google Business
// Profile is linked through GHL.

type FilterValue = "all" | "5" | "4" | "low" | "need";

interface Review {
  id: string;
  name: string;
  initials: string;
  // CSS gradient for the avatar tile. Decorative only, never gold.
  avatar: string;
  rating: number;
  date: string;
  body: string;
  // Whether this review already has a posted reply in the sample data.
  replied: boolean;
  // The suggested reply (when not yet replied) or the posted reply text.
  reply: string;
}

// Sample data for the demo only: a local plumbing + HVAC client (Valley Plumbing
// & HVAC). Mix of 5, 4 and one 3 star, some already replied, some awaiting a
// reply. No fabricated growth or percentage claims anywhere.
const SAMPLE_REVIEWS: Review[] = [
  {
    id: "garcia",
    name: "The Garcias",
    initials: "G",
    avatar: "linear-gradient(135deg,#f59e0b,#fbbf24)",
    rating: 5,
    date: "Jun 27",
    body: "Woke up to no hot water on a Sunday and figured we were stuck till Monday. Called Valley, they had a tech out by 9 and a new unit running before lunch. Clean work, fair price, no upsell games. We will be calling them for the AC next.",
    replied: false,
    reply: "Thank you so much, Garcia family. A cold Sunday morning is no time to be without hot water, so we are glad we could get you back up and running before lunch. We would be happy to take care of your AC whenever you are ready. Thanks for trusting Valley.",
  },
  {
    id: "priya",
    name: "Priya S.",
    initials: "P",
    avatar: "linear-gradient(135deg,#9333ea,#c084fc)",
    rating: 4,
    date: "Jun 26",
    body: "Friendly tech and honest pricing on our garbage disposal swap. Took a touch longer than quoted, but the result is solid and they left the area cleaner than they found it.",
    replied: false,
    reply: "Thanks, Priya. Glad the disposal is running well and that we left things tidy. Noted on the timing, we will keep our quotes honest on the next visit. Appreciate you having us out.",
  },
  {
    id: "mark",
    name: "Mark T.",
    initials: "M",
    avatar: "linear-gradient(135deg,#4f46e5,#7c73f0)",
    rating: 5,
    date: "Jun 25",
    body: "Booked an AC tune-up before the heat wave hit. The tech actually walked me through the pressure and temp readings instead of just handing me a bill. Honest crew. Recommended.",
    replied: true,
    reply: "Appreciate it, Mark. Walking you through the readings is just how we like to do it, no guesswork, no pressure. Glad we got you set before the heat. Stay cool out there and thanks for the recommendation.",
  },
  {
    id: "dale",
    name: "Dale W.",
    initials: "D",
    avatar: "linear-gradient(135deg,#64748b,#94a3b8)",
    rating: 3,
    date: "Jun 24",
    body: "Work itself was solid, but the morning window slipped and I waited around longer than I would have liked before anyone called. Would use again if scheduling is tighter next time.",
    replied: false,
    reply: "Dale, thank you for the honest note and for the kind words on the work itself. You are right that the morning window slipped, and a heads-up call should have gone out sooner. We have tightened how we flag running-late jobs. We would be glad to earn a smoother visit next time.",
  },
  {
    id: "janet",
    name: "Janet R.",
    initials: "J",
    avatar: "linear-gradient(135deg,#0891b2,#22d3ee)",
    rating: 5,
    date: "Jun 21",
    body: "Burst pipe at 6am with water heading for the floors. They picked up, showed up fast, and shut it down before any real damage. I cannot say enough good things. Lifesavers.",
    replied: true,
    reply: "Janet, a 6am burst pipe is exactly the call we keep the phone on for. So glad we caught it before the floors did. Thank you for the kind words, and we hope you stay dry from here on out.",
  },
  {
    id: "alicia",
    name: "Alicia M.",
    initials: "A",
    avatar: "linear-gradient(135deg,#16a34a,#22c55e)",
    rating: 4,
    date: "Jun 18",
    body: "Good service and a friendly tech for our faucet replacement. Quick to schedule and the new fixture looks great. A small drip came back the next day but they returned and sorted it at no charge.",
    replied: true,
    reply: "Thanks, Alicia. Glad the new faucet looks the part, and sorry about that little drip. A quick no-charge return is the least we can do when something needs a second look. Appreciate your patience and the kind review.",
  },
  {
    id: "reyes",
    name: "The Reyes Family",
    initials: "R",
    avatar: "linear-gradient(135deg,#0ea5e9,#38bdf8)",
    rating: 5,
    date: "Jun 14",
    body: "Same-day service when our AC quit on the first really hot day. Up front about the cost, careful in the house, and had us cool again by the afternoon. This is our plumber and HVAC crew from now on.",
    replied: true,
    reply: "Thank you, Reyes family. The first hot day is always the busy one, so we are glad we could still get out same-day and have you cool by the afternoon. It means a lot to be your go-to crew. Call us any time.",
  },
];

// Google "G" mark, rebuilt from the mockup so the source label reads as Google
// without pulling in a new icon dependency.
function GoogleGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 01-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.5z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-1 6.7-2.6l-3.4-2.6c-.9.6-2.1 1-3.3 1-2.6 0-4.7-1.7-5.5-4H3v2.6A10 10 0 0012 22z" />
      <path fill="#FBBC05" d="M6.5 13.8a6 6 0 010-3.6V7.6H3a10 10 0 000 8.8z" />
      <path fill="#EA4335" d="M12 6.4c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003 7.6l3.5 2.6c.8-2.3 2.9-4 5.5-4z" />
    </svg>
  );
}

function Avatar({ initials, gradient }: { initials: string; gradient: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] font-display text-[13px] font-bold text-white"
      style={{ backgroundImage: gradient }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function ReviewRow({
  review,
  replied,
  open,
  draft,
  onToggle,
  onDraftChange,
  onPost,
}: {
  review: Review;
  replied: boolean;
  open: boolean;
  draft: string;
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onPost: () => void;
}) {
  const lowStar = review.rating <= 3;
  return (
    <li className="border-b border-divider last:border-b-0">
      <div className="grid grid-cols-[36px_1fr] gap-3 px-4 py-4 sm:grid-cols-[36px_1fr_auto]">
        <Avatar initials={review.initials} gradient={review.avatar} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-display text-[14px] text-text">{review.name}</span>
            <StarRating value={review.rating} size={13} />
            <span className="font-data text-[11.5px] text-faint tnum">{review.date}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-faint">
              <GoogleGlyph /> Google
            </span>
          </div>
          <p className="mt-1.5 max-w-[74ch] text-[13.5px] leading-relaxed text-text">{review.body}</p>
        </div>

        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:flex-col sm:items-end">
          {replied ? (
            <Badge tone="positive">
              <Check size={12} strokeWidth={2.4} /> Replied
            </Badge>
          ) : (
            <Badge tone="warning">Needs reply</Badge>
          )}
          <Button
            variant={replied ? "ghost" : "primary"}
            size="sm"
            onClick={onToggle}
            aria-expanded={open}
          >
            {replied ? (
              "View reply"
            ) : (
              <>
                <MessageSquare size={14} /> Reply
              </>
            )}
          </Button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 sm:pl-[60px]">
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-surface-2">
            <div
              className={`flex items-center gap-2 border-b border-border px-3 py-2 ${
                replied ? "" : "bg-brand-tint"
              }`}
            >
              {replied ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-positive">
                  <Check size={13} strokeWidth={2.4} /> Your posted reply
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-brand-text">
                  <Sparkles size={13} /> Suggested reply
                </span>
              )}
              <span className="flex-1" />
              {replied ? (
                <span className="font-data text-[10.5px] text-muted">{review.date}</span>
              ) : (
                <span className="text-[10.5px] text-muted">Edit before posting</span>
              )}
            </div>

            <textarea
              value={replied ? review.reply : draft}
              readOnly={replied}
              onChange={(e) => onDraftChange(e.target.value)}
              className="block min-h-[78px] w-full resize-y bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-text outline-none read-only:cursor-default"
            />

            {!replied && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-[11px] text-faint">
                  <Star size={12} style={{ color: "var(--star)", fill: "var(--star)" }} />
                  {lowStar
                    ? "Calm, specific replies tend to land best on lower ratings."
                    : "Posts publicly under the review."}
                </span>
                <span className="flex-1" />
                <Button variant="secondary" size="sm">
                  <RefreshCw size={13} /> Regenerate
                </Button>
                <Button variant="primary" size="sm" onClick={onPost}>
                  Post reply
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function ReviewsAll() {
  const demo = demoMode();
  const reviews = demo ? SAMPLE_REVIEWS : [];

  const [filter, setFilter] = useState<FilterValue>("all");
  // Which row's reply drawer is open (review id), or null when all collapsed.
  const [openId, setOpenId] = useState<string | null>(null);
  // Optimistic, local-only record of reviews the user has just replied to.
  const [posted, setPosted] = useState<Record<string, boolean>>({});
  // Editable draft text per review, seeded lazily from the suggested reply.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const isReplied = (r: Review) => r.replied || posted[r.id] === true;

  // Live filter counts so the segmented bar reflects optimistic reply state.
  const counts = useMemo(() => {
    return {
      all: reviews.length,
      five: reviews.filter((r) => r.rating === 5).length,
      four: reviews.filter((r) => r.rating === 4).length,
      low: reviews.filter((r) => r.rating <= 3).length,
      need: reviews.filter((r) => !isReplied(r)).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, posted]);

  const filterOptions: SegmentOption<FilterValue>[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "5", label: "5 star", count: counts.five },
    { value: "4", label: "4 star", count: counts.four },
    { value: "low", label: "1-3 star", count: counts.low },
    { value: "need", label: "Needs reply", count: counts.need },
  ];

  const visible = reviews.filter((r) => {
    switch (filter) {
      case "5":
        return r.rating === 5;
      case "4":
        return r.rating === 4;
      case "low":
        return r.rating <= 3;
      case "need":
        return !isReplied(r);
      default:
        return true;
    }
  });

  function toggleDrawer(id: string) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  function postReply(id: string) {
    setPosted((cur) => ({ ...cur, [id]: true }));
    setOpenId(null);
  }

  return (
    <Shell>
      <div className={REVIEWS_CONTAINER}>
        <PageBar
          tabs={REVIEWS_TABS}
          count={demo ? `${reviews.length}` : undefined}
          description="Every Google review in one queue. Filter, then reply in your own words or send the suggested draft. Replying lifts your standing with customers and with Google."
          filters={
            demo ? (
              <Segmented options={filterOptions} value={filter} onChange={setFilter} />
            ) : undefined
          }
        />

        {demo ? (
          <Panel className="overflow-hidden">
            {visible.length === 0 ? (
              <div className="px-4 py-12">
                <EmptyState
                  icon={<Star size={22} />}
                  title="Nothing in this filter"
                  description="No reviews match this filter right now. Try a different one above."
                />
              </div>
            ) : (
              <ul>
                {visible.map((r) => (
                  <ReviewRow
                    key={r.id}
                    review={r}
                    replied={isReplied(r)}
                    open={openId === r.id}
                    draft={drafts[r.id] ?? r.reply}
                    onToggle={() => toggleDrawer(r.id)}
                    onDraftChange={(value) => setDrafts((cur) => ({ ...cur, [r.id]: value }))}
                    onPost={() => postReply(r.id)}
                  />
                ))}
              </ul>
            )}
          </Panel>
        ) : (
          <ReviewsComingSoon />
        )}
      </div>
    </Shell>
  );
}
