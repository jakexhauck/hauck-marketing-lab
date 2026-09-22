import { useState } from "react";
import { AlertCircle } from "lucide-react";
import Shell from "../components/Shell";
import TestBanner from "../components/TestBanner";
import HandoffsList from "../components/handoffs/HandoffsList";
import HandoffOutcomeModal from "../components/handoffs/HandoffOutcomeModal";
import { useAuth } from "../context/AuthContext";
import { useNow } from "../context/NowContext";
import { useHandoffsQuery } from "../hooks/useApi";
import { demoMode } from "../demo/demoMode";
import { funnel, isIgnored } from "../lib/handoffModel";
import type { ApiHandoff } from "../lib/api";

// The Handoffs / Leads board: a single list of leads a setter qualified and
// handed over. Tap a lead to record its outcome (the conversation itself lives
// on the owner's own phone now, so there's no chat here). Rendered on its own
// and inside the combined Sales page's "Leads" tab, so it takes no Shell.
export function HandoffsBoard({
  onBook,
}: {
  // Estimate / Job hand off to the Schedule tab to pick a slot (wired by Sales).
  onBook?: (handoff: ApiHandoff, kind: "estimate" | "job") => void;
} = {}) {
  const { mode, session } = useAuth();
  const now = useNow();
  // Live now: a real session reads Willis's Sales pipeline through the same
  // /api/handoffs the demo routes to its in-memory store.
  const enabled = demoMode() || Boolean(session);
  const query = useHandoffsQuery(enabled);
  const isTest = mode === "test";
  const [openId, setOpenId] = useState<string | null>(null);

  const items: ApiHandoff[] = query.data?.handoffs ?? [];
  const selected = items.find((h) => h.id === openId) ?? null;
  const stats = funnel(items);
  const ignoredCount = items.filter((h) => isIgnored(h, now)).length;

  return (
    <>
      {isTest && <TestBanner />}
      {/* px-5, not px-[22px]: this board sits directly under the page header
          panel, which uses PAGE_CONTAINER's 20px gutter. At 22px the card edges
          below the header missed the header's edges by 2px on every phone,
          which reads as a wobble down the left side of the page. */}
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 pb-6 pt-4 lg:px-6">
        {/* Scoreboard: the funnel at a glance, plus the accountability nudge.
            Shown even at zero so the page keeps its shape on a quiet day: an
            empty board should read as "nothing handed over yet", not as a page
            that failed to render. Hidden only while the numbers are unknown
            (loading / error), since flashing zeros that then jump to real
            figures is worse than showing nothing for a beat. */}
        {!query.isLoading && !query.isError && (
          // Phone: a three-column strip (number over label), with the
          // attention nudge on its own line above it. The old single line of
          // four inline stats wrapped at 390px and stranded "7 leads" alone,
          // centred, on a second line. Desktop shows the same strip, capped width.
          <div className="mb-3 shrink-0">
            {ignoredCount > 0 && (
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-rose-600 dark:text-rose-400 lg:justify-start">
                <AlertCircle size={15} strokeWidth={2.5} />
                {ignoredCount} need{ignoredCount === 1 ? "s" : ""} attention
              </div>
            )}
            <div className="grid grid-cols-3 overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] lg:max-w-md">
              <ScoreCell value={String(stats.handed)} label="Leads" />
              <ScoreCell value={String(stats.estimated)} label="Estimates" divider />
              <ScoreCell
                value={
                  stats.revenue > 0
                    ? `${stats.booked + stats.won} · $${stats.revenue.toLocaleString()}`
                    : String(stats.booked + stats.won)
                }
                label="Sold"
                tone="text-emerald-600 dark:text-emerald-400"
                divider
              />
            </div>
          </div>
        )}

        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load handoffs.
          </div>
        ) : query.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
              aria-hidden
            />
          </div>
        ) : (
          // The board card renders whether or not there is anything in it, with
          // the empty line sitting inside its own frame. An empty board only
          // sizes to its message (no flex-1), so a quiet day reads as a small
          // card rather than one tall blank rectangle.
          <div
            className={
              "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" +
              (items.length > 0 ? " flex-1" : "")
            }
          >
            <HandoffsList
              items={items}
              selectedId={openId}
              onOpen={setOpenId}
              emptyLabel="No handoffs yet."
            />
          </div>
        )}
      </div>

      {selected && (
        <HandoffOutcomeModal
          handoff={selected}
          onClose={() => setOpenId(null)}
          onBook={
            onBook
              ? (kind) => {
                  onBook(selected, kind);
                  setOpenId(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

// Standalone route wrapper. The combined Sales page renders <HandoffsBoard/>
// directly under its "Leads" tab.
export default function Handoffs() {
  return (
    <Shell>
      <HandoffsBoard />
    </Shell>
  );
}

function ScoreCell({
  value,
  label,
  tone = "text-[var(--text)]",
  divider = false,
}: {
  value: string;
  label: string;
  tone?: string;
  divider?: boolean;
}) {
  return (
    <div className={"min-w-0 px-2 py-2.5 text-center" + (divider ? " border-l border-[var(--divider)]" : "")}>
      <div className={"truncate text-[16px] font-semibold tnum " + tone}>{value}</div>
      <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">{label}</div>
    </div>
  );
}
