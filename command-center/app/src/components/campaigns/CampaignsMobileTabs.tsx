import { NavLink } from "react-router-dom";

// On desktop the sidebar's expandable Campaigns group handles sub-page nav. On
// phones that rail is hidden, so the Campaigns pages render this scrollable tab
// strip up top. Hidden at lg+ where the sidebar takes over.
const TABS = [
  { to: "/marketing/campaigns", label: "Overview", end: true },
  { to: "/marketing/campaigns/all", label: "Campaigns" },
  { to: "/marketing/campaigns/reactivation", label: "Reactivation" },
  { to: "/marketing/campaigns/audiences", label: "Audiences" },
  { to: "/marketing/campaigns/templates", label: "Templates" },
  { to: "/marketing/campaigns/insights", label: "What's working" },
];

export default function CampaignsMobileTabs() {
  return (
    <nav
      aria-label="Campaigns sections"
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
              isActive ? "text-white shadow-brand" : "border border-border-strong text-muted",
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
