import { INBOX_TABS } from "../../lib/inboxTabs";

// The horizontal tab strip that sits at the top of the Inbox. Nine tabs (seven
// pipeline stages + Chat Widget / Estimate Form), each with a live count, in one
// scrollable row. Selecting a tab filters the queue below it.
export default function InboxTabStrip({
  counts,
  active,
  onSelect,
}: {
  counts: Record<string, number>;
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav
      aria-label="Inbox stages"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3"
      style={{ scrollbarWidth: "none" }}
    >
      {INBOX_TABS.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-current={on ? "page" : undefined}
            className={
              "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-3 font-display text-[13px] font-semibold transition-colors " +
              (on ? "text-brand" : "text-muted hover:text-text")
            }
          >
            {t.label}
            <span
              className={
                "tnum text-[11px] " + (on ? "text-brand/70" : "text-faint")
              }
            >
              {counts[t.key] ?? 0}
            </span>
            {on && (
              <span
                className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-brand"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
