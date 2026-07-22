import { INBOX_TABS, FIRST_SOURCE_TAB_INDEX } from "../../lib/inboxTabs";

// The Inbox stage/source tabs. Rendered as PageBar children, so they sit on the
// SAME line as the "Inbox" title and share its single divider — hence no <nav>
// and no border here, or the page grows a second rule and ~40px of dead air
// above the queue.
//
// Styling deliberately mirrors TabLinks (PageTabs.tsx) so these read as the same
// tabs as every other section, even though they filter in place rather than
// navigate, and so are buttons rather than NavLinks. Counts were dropped to keep
// all ten on one line at 1440.
export default function InboxTabStrip({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      {INBOX_TABS.map((t, i) => {
        const on = t.key === active;
        return (
          <div key={t.key} className="flex shrink-0 items-stretch gap-4">
            {/* Splits the Sales stages from the source tabs, which cut across them */}
            {i === FIRST_SOURCE_TAB_INDEX && (
              <span
                className="my-2 w-px shrink-0 bg-[var(--border)]"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(t.key)}
              aria-current={on ? "page" : undefined}
              className={[
                "relative shrink-0 whitespace-nowrap px-0.5 pb-3 pt-2 text-[13.5px] transition-colors",
                on
                  ? "font-semibold text-[var(--text)]"
                  : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {t.label}
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full"
                  style={{ backgroundImage: "var(--grad-brand)" }}
                />
              )}
            </button>
          </div>
        );
      })}
    </>
  );
}
