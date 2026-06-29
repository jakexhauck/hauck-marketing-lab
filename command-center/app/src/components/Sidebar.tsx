import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import {
  NAV,
  visibleNav,
  isNavSection,
  type NavItem,
  type NavSection,
} from "../lib/nav";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";

// A single page row. Used for the standalone Home button and for the children of
// the open section in the lower zone, so the active (gradient) and hover
// treatments stay identical wherever a real page lives.
function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      data-tour={`nav-${item.to.slice(1)}`}
      className={({ isActive }) =>
        [
          "group relative mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
          isActive
            ? "shadow-brand text-white"
            : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-white/60 hover:text-[var(--text)] dark:hover:bg-white/5",
        ].join(" ")
      }
      style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
    >
      <item.icon size={17} className="shrink-0 opacity-80" />
      {item.label}
    </NavLink>
  );
}

// A top-level section button. It is not a page: clicking it opens the section
// (revealing its pages in the lower zone) and jumps to the section's first real
// page. The open section gets a soft "selected" treatment; the gradient pill is
// reserved for the actual active page below.
function SectionButton({
  section,
  open,
  onClick,
}: {
  section: NavSection;
  open: boolean;
  onClick: () => void;
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      data-tour={`nav-section-${section.id}`}
      onClick={onClick}
      aria-expanded={open}
      className={[
        "group relative mb-0.5 flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
        open
          ? "bg-white/70 text-[var(--brand-text)] dark:bg-white/[0.06]"
          : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-white/60 hover:text-[var(--text)] dark:hover:bg-white/5",
      ].join(" ")}
    >
      <Icon size={17} className="shrink-0 opacity-80" />
      {section.label}
    </button>
  );
}

// Is `path` inside this section (exact match or a child route of one of its
// items)? Used to decide which section auto-opens for the current route.
function sectionHasPath(section: NavSection, path: string): boolean {
  return section.items.some((i) => path === i.to || path.startsWith(i.to + "/"));
}

// Desktop-only rail (lg+). The phone keeps the bottom tab bar; this is hidden
// below lg via the `hidden lg:flex` wrapper. Same nav source of truth and the
// same permission gate the bottom bar uses, so the two never drift.
//
// Two zones: the top holds Home plus one button per section; the lower zone
// shows the open section's pages. Opening a section both reveals its pages and
// navigates to its first real one, so a top button is never a dead end.
export default function Sidebar() {
  const { client } = useClient();
  const { session, isOwner, mode, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navEntries = visibleNav(NAV, { isOwner, can });
  const sections = navEntries.filter(isNavSection);
  const standalone = navEntries.filter(
    (e): e is NavItem => !isNavSection(e),
  );

  // The section that owns the current route, if any (Home/Settings own none).
  const routeSection = sections.find((s) => sectionHasPath(s, location.pathname));

  // Which section's pages are shown. Defaults to the route's section, falling
  // back to the first section so the lower zone is never empty.
  const [openId, setOpenId] = useState<string | null>(
    routeSection?.id ?? sections[0]?.id ?? null,
  );

  // Keep the open section in sync when navigation happens elsewhere (deep link,
  // bottom bar, browser back), but leave it alone on routes that own no section.
  useEffect(() => {
    if (routeSection) setOpenId(routeSection.id);
  }, [routeSection?.id]);

  const openSection = sections.find((s) => s.id === openId) ?? null;

  function open(section: NavSection) {
    setOpenId(section.id);
    // Land on the first real page; only fall back to a coming-soon stub if the
    // whole section is still stubbed.
    const target = section.items.find((i) => !i.comingSoon) ?? section.items[0];
    if (target && location.pathname !== target.to) navigate(target.to);
  }

  // No rail before sign-in: the login screen also renders inside Shell, and an
  // unauthenticated session would otherwise show a full (owner-default) nav.
  if (!session) return null;

  const brand = client.brand;

  return (
    <aside className="glass hidden h-dvh w-[244px] shrink-0 flex-col border-r border-white/50 dark:border-white/10 lg:sticky lg:top-0 lg:flex">
      {/* Brand mark */}
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-4">
        <span
          className="shadow-brand flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[12px] font-bold text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          {brand.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] font-semibold leading-tight text-[var(--text)]">
            {brand.appName}
          </div>
          {client.niche && (
            <div className="truncate text-[11px] text-[var(--text-faint)]">{client.niche}</div>
          )}
        </div>
      </div>

      {/* Top zone: Home + one button per section */}
      <nav className="px-3 py-1">
        {standalone.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
        {sections.map((section) => (
          <SectionButton
            key={section.id}
            section={section}
            open={openId === section.id}
            onClick={() => open(section)}
          />
        ))}
      </nav>

      {/* Lower zone: the open section's pages */}
      <div className="mt-1 flex-1 overflow-y-auto border-t border-[var(--divider)] px-3 pt-3">
        {openSection && (
          <>
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
              {openSection.label}
            </div>
            {openSection.items.map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))}
          </>
        )}
      </div>

      {/* Footer controls */}
      <div className="border-t border-[var(--divider)] px-3 py-3">
        {mode === "test" && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Test account
          </div>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            [
              "mb-1 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-[color,background,transform] duration-200",
              isActive
                ? "shadow-brand text-white"
                : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-white/60 hover:text-[var(--text)] dark:hover:bg-white/5",
            ].join(" ")
          }
          style={({ isActive }) =>
            isActive ? { backgroundImage: "var(--grad-brand)" } : undefined
          }
        >
          <Settings size={16} className="shrink-0 opacity-80" /> Settings
        </NavLink>
      </div>
    </aside>
  );
}
