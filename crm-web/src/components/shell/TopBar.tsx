import { useLocation } from "react-router-dom";
import { useIsFetching } from "@tanstack/react-query";
import { Inbox, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV } from "@/lib/nav";
import { useSummaryQuery } from "@/hooks/useApi";

// A slim global bar: where you are, the live pulse (new today / unread), and a
// quiet sync indicator. Each surface owns its own PageHeader below this.
export function TopBar() {
  const { pathname } = useLocation();
  const current =
    [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) =>
      n.to === "/" ? pathname === "/" : pathname.startsWith(n.to),
    ) ?? NAV[0];
  const { data: summary } = useSummaryQuery();
  const fetching = useIsFetching() > 0;

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/80 px-5 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <current.icon size={17} className="text-muted" />
        <h1 className="font-display text-[15px] text-text">{current.label}</h1>
        <span
          className={cn(
            "ml-1 h-1.5 w-1.5 rounded-full transition-colors",
            fetching ? "bg-brand animate-pulse" : "bg-transparent",
          )}
          title={fetching ? "Syncing…" : undefined}
          aria-hidden
        />
      </div>

      <div className="flex items-center gap-2">
        <PulseChip
          icon={<Sparkles size={13} />}
          label="New today"
          value={summary?.newToday ?? 0}
          tone={summary && summary.newToday > 0 ? "brand" : "neutral"}
        />
        <PulseChip
          icon={<Inbox size={13} />}
          label="Unread"
          value={summary?.unreadConversations ?? 0}
          tone={summary && summary.unreadConversations > 0 ? "warning" : "neutral"}
        />
      </div>
    </header>
  );
}

function PulseChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "brand" | "warning" | "neutral";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-2 pr-2.5",
        tone === "brand" && "border-[color-mix(in_srgb,var(--brand)_30%,transparent)]",
        tone === "warning" && "border-[color-mix(in_srgb,var(--warning)_30%,transparent)]",
      )}
    >
      <span
        className={cn(
          tone === "brand" ? "text-brand-text" : tone === "warning" ? "text-warning" : "text-faint",
        )}
      >
        {icon}
      </span>
      <span className="font-data text-[13px] font-semibold text-text tnum">{value}</span>
      <span className="text-[11px] text-faint">{label}</span>
    </div>
  );
}
