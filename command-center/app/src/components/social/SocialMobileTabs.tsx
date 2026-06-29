import { NavLink } from "react-router-dom";

// On desktop the sidebar's expandable Social group handles sub-page navigation.
// On phones that rail is hidden, so the Social pages render this scrollable tab
// strip up top to move between Overview / Ideas / Calendar / My Posts / What's
// working. Hidden at lg+ where the sidebar takes over.
const TABS = [
  { to: "/marketing/social", label: "Overview", end: true },
  { to: "/marketing/social/ideas", label: "Ideas" },
  { to: "/marketing/social/calendar", label: "Calendar" },
  { to: "/marketing/social/posts", label: "My Posts" },
  { to: "/marketing/social/insights", label: "What's working" },
];

export default function SocialMobileTabs() {
  return (
    <nav
      aria-label="Social sections"
      className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 lg:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            [
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "text-white shadow-brand"
                : "border border-border-strong text-muted",
            ].join(" ")
          }
          style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
