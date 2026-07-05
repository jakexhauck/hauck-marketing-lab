import {
  MessageSquare,
  Send,
  MousePointerClick,
  Star,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Panel,
  PanelHeader,
  EmptyState,
  LoadingState,
  ErrorState,
} from "../../components/ui";
import type { ReviewFunnelData } from "../../lib/reviewsFunnel";

// The read-only review journey: request -> click -> public review, driven by the
// live review campaign (functions/api/reviews/funnel.ts). Shared by the dedicated
// Review Pipeline page. Same golden rule as the rest of Reviews: a real client
// only ever sees their own counts, and an honest "not started yet" state until a
// campaign has asked anyone. The per-review content (star-by-star list, replies,
// all-time average) still needs the Google Business Profile connection, so this
// shows the funnel we can drive today.
export function ReviewsFunnelView({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: ReviewFunnelData | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <Panel>
        <LoadingState label="Loading your review funnel" />
      </Panel>
    );
  }
  if (isError) {
    return (
      <Panel className="px-4 py-8">
        <ErrorState
          title="Could not load reviews"
          description="Try again."
          onRetry={onRetry}
        />
      </Panel>
    );
  }

  const populated = Boolean(data && data.asked > 0);

  if (!populated) {
    return (
      <Panel className="px-4 py-16">
        <EmptyState
          icon={<Star size={22} />}
          title="We haven't started collecting reviews for you yet"
          description="As soon as we begin asking your customers for reviews, the whole journey shows up here: how many were asked, how many opened the request, and how many left you a public review."
        />
      </Panel>
    );
  }

  const d = data as ReviewFunnelData;
  const conversion = d.asked > 0 ? Math.round((d.positive / d.asked) * 100) : 0;

  const kpis = [
    { label: "Asked for a review", value: d.asked, icon: <Send size={15} />, brand: false },
    { label: "Clicked the link", value: d.clicked, icon: <MousePointerClick size={15} />, brand: false },
    { label: "Left a review", value: d.positive, icon: <Star size={15} />, brand: true },
    { label: "Caught privately", value: d.negative, icon: <ShieldCheck size={15} />, brand: false },
  ];

  // Funnel steps, each measured against everyone asked, intensifying toward the
  // win (grey -> brand tint -> full brand gradient).
  const steps = [
    { key: "asked", label: "Asked for a review", hint: "Request sent after the job wrapped", value: d.asked, bar: "var(--surface-3)", grad: false },
    { key: "clicked", label: "Clicked the link", hint: "Opened the review request", value: d.clicked, bar: "var(--brand-tint)", grad: false },
    { key: "positive", label: "Left a public review", hint: "Five-star submission on Google", value: d.positive, bar: "var(--grad-brand)", grad: true },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <Panel key={k.label} className="p-4">
            <div className="flex items-center gap-1.5 text-[13px] text-muted">
              <span className="text-faint">{k.icon}</span> {k.label}
            </div>
            <div
              className={`mt-2 font-data text-[28px] font-semibold tnum ${
                k.brand ? "text-brand-text" : "text-text"
              }`}
            >
              {k.value.toLocaleString("en-US")}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel className="overflow-hidden">
            <PanelHeader title="The review journey" />
            <div className="flex flex-col gap-4 p-4">
              {steps.map((s) => (
                <div key={s.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-display text-[14px] text-text">{s.label}</div>
                    <div className="shrink-0 font-data text-[13px] font-semibold text-text">
                      {s.value.toLocaleString("en-US")}
                    </div>
                  </div>
                  <div className="mt-0.5 text-[12px] text-faint">{s.hint}</div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max((s.value / Math.max(d.asked, 1)) * 100, s.value > 0 ? 3 : 0)}%`,
                        ...(s.grad ? { backgroundImage: s.bar } : { background: s.bar }),
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[12px] text-faint">
                <span className="flex items-center gap-1.5">
                  <Users size={13} /> {d.asked.toLocaleString("en-US")} asked so far
                </span>
                <span className="flex items-center gap-1.5">
                  <Star size={13} style={{ color: "var(--star)", fill: "var(--star)" }} /> {conversion}% left a public review
                </span>
                {d.negative > 0 && (
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={13} /> {d.negative} routed to private feedback
                  </span>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <PanelHeader title="Recently collected" />
            {d.recent.length > 0 ? (
              <ul>
                {d.recent.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  >
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-semibold"
                      style={{ background: "var(--brand-tint)", color: "var(--brand-text)" }}
                      aria-hidden
                    >
                      {r.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[14px] text-text">{r.name}</div>
                      <div className="mt-0.5 text-[12px] text-faint">{r.sub}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  icon={<Star size={22} />}
                  title="No reviews collected yet"
                  description="Customers who leave a public review will appear here."
                />
              </div>
            )}
          </Panel>

          <Panel className="flex items-start gap-3 border-brand/30 bg-brand-tint p-4">
            <MessageSquare size={20} className="mt-0.5 shrink-0 text-brand-text" />
            <div className="flex-1 text-[13px] leading-snug text-text">
              Reading each review star-by-star and replying lands once your Google Business
              Profile is connected. This funnel is live from your review campaign now.
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
