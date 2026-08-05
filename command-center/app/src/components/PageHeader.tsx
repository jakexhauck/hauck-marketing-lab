import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "../lib/cn";
import GlobalControls from "./desktop/GlobalControls";

// The header every tab-less desktop surface renders at the top of its scroll
// area, as the same FLOATING PANEL <PageBar> uses: a raised surface card with
// the title and count on the left, then the page's own actions and the global
// controls on the right. Tab-less pages and Marketing sections therefore top
// out identically; the only difference is whether there is a tab control in the
// middle.
//
// No description slot, matching PageBar. Explanatory paragraphs under a header
// are banned across the client app: they push the real content down and the
// title already says what the page is.
export function PageHeader({
  title,
  count,
  actions,
  filters,
  onBack,
  backLabel = "Back",
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  // Renders a chevron before the title. Sub-pages that used to carry a back
  // arrow in the old navy hero (Automations, Coming Soon, the detail screens)
  // keep that control when they move onto this header, instead of each page
  // hand-rolling its own back button in a slightly different spot.
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 shrink-0", className)}>
      {/* Wraps onto a second line below lg, for the same reason <PageBar> does:
          `actions` is often a 4-segment range control (~280px) and it was
          shrink-0 beside the title, so on a 375px phone it pushed the whole
          DOCUMENT sideways. The Lead Tracker (the page clients land on) was
          horizontally scrollable because of this. Actions get their own
          full-width line on a phone and scroll within it if still too wide. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)] lg:flex-nowrap">
        {/* Phone: the title line is CENTRED, and the back chevron is taken out
            of the flow (absolute) so it cannot pull the title off centre. That
            is the standard phone title bar, and it stops a short title sitting
            in the top-left corner of a full-width panel with a stretch of empty
            white beside it. Desktop keeps the original left-aligned row. */}
        <div className="relative flex w-full min-w-0 flex-1 basis-full items-baseline justify-center gap-2.5 lg:w-auto lg:basis-auto lg:justify-start">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              // 44px hit area (the iOS minimum) on a 36px visual box, pulled
              // left so the chevron optically lines up with the panel edge.
              className="absolute left-0 top-1/2 flex h-11 w-9 -translate-y-1/2 shrink-0 items-center justify-center rounded-[9px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] active:bg-[var(--surface-2)] lg:static lg:-my-1 lg:-ml-1.5 lg:translate-y-0 lg:self-center"
            >
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
          )}
          <h2 className="truncate font-display text-[16px] font-semibold leading-none tracking-[-0.01em] text-text">
            {title}
          </h2>
          {count != null && <span className="font-data text-[12px] text-faint tnum">{count}</span>}
        </div>
        {actions && (
          <div
            className="flex w-full basis-full items-center justify-center gap-2.5 overflow-x-auto lg:w-auto lg:basis-auto lg:justify-start lg:overflow-visible"
            style={{ scrollbarWidth: "none" }}
          >
            {actions}
          </div>
        )}
        {/* hidden below lg, not just empty: GlobalControls renders nothing on a
            phone, but this wrapper was still a flex ITEM, so it wrapped onto a
            phantom third row and added a gap-y-3 of dead height to the bottom
            of every header card. */}
        <div className="hidden shrink-0 lg:block">
          <GlobalControls />
        </div>
      </div>
      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}
