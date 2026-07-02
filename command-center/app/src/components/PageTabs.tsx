import { NavLink } from "react-router-dom";
import type { PageTab } from "../lib/pageTabs";

// The in-page sub-navigation for any section with more than one page (every
// Marketing channel, plus Leads). Replaces the old per-channel *MobileTabs and
// the desktop sidebar sub-groups with one bar shown on every screen size.
//
// Underline treatment: left-aligned text with a thin brand indicator sliding
// under the active tab. Quieter than a filled pill, and it scales cleanly to the
// six-tab channels. Horizontally scrollable on narrow screens.
export default function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <nav
      aria-label="Section pages"
      className="mb-5 flex gap-6 overflow-x-auto border-b border-[var(--border)]"
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            [
              "relative shrink-0 whitespace-nowrap px-0.5 pb-3 pt-2 text-[13.5px] transition-colors",
              isActive
                ? "font-semibold text-[var(--text)]"
                : "font-medium text-[var(--text-muted)] hover:text-[var(--text)]",
            ].join(" ")
          }
        >
          {({ isActive }) => (
            <>
              {t.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full"
                  style={{ backgroundImage: "var(--grad-brand)" }}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
