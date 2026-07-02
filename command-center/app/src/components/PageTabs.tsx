import { NavLink } from "react-router-dom";
import type { PageTab } from "../lib/pageTabs";

// The underline tab links, shared by the standalone <PageTabs> bar (Leads) and
// the combined <PageBar> header (every Marketing section). Left-aligned text
// with a thin brand indicator sliding under the active tab.
export function TabLinks({ tabs }: { tabs: PageTab[] }) {
  return (
    <>
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
    </>
  );
}

// Standalone in-page sub-navigation (used by the Leads section, which has its
// own bespoke header). Marketing sections use <PageBar>, which folds this row in
// beside the section title.
export default function PageTabs({ tabs }: { tabs: PageTab[] }) {
  return (
    <nav
      aria-label="Section pages"
      // shrink-0: PAGE_CONTAINER is a flex column with flex-1, so on tall pages
      // flex-shrink would otherwise squeeze this (it has overflow-x-auto) down to
      // its border. Keep its natural height on every page.
      className="mb-5 flex shrink-0 gap-6 overflow-x-auto border-b border-[var(--border)]"
      style={{ scrollbarWidth: "none" }}
    >
      <TabLinks tabs={tabs} />
    </nav>
  );
}
