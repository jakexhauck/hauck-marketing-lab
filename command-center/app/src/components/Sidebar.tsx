import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Settings, ChevronDown } from "lucide-react";
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
// treatments stay identical wherever a real page lives. `end` forces an exact
// route match (used for a group's overview child, whose route is a prefix of its
// siblings, so it does not stay active on the deeper pages).
function NavItemLink({ item, end }: { item: NavItem; end?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={end}
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

// Is `path` inside this item's subtree (its own route or any child route)?
function itemHasPath(item: NavItem, path: string): boolean {
  if (path === item.to) return true;
  return (item.children ?? []).some(
    (c) => path === c.to || path.startsWith(c.to + "/"),
  );
}

// An expandable page row in the lower zone: a parent that owns sub-pages. Unlike
// a section, the parent is itself a real page (its overview), so clicking it both
// opens the group and navigates to its route. Children render indented beneath
// with a guide rule; the active gradient pill stays on the child (or the
// overview child when on the parent route).
function NavItemGroup({ item }: { item: NavItem }) {
  const location = useLocation();
  const navigate = useNavigate();
  const children = item.children ?? [];
  const within = itemHasPath(item, location.pathname);
  const [open, setOpen] = useState(within);

  // Keep the group open whenever the route lands inside it (deep link, back
  // button, a child clicked elsewhere). Manual collapse still works otherwise.
  useEffect(() => {
    if (within) setOpen(true);
  }, [within]);

  const Icon = item.icon;
  return (
    <div className="mb-0.5">
      <button
        type="button"
        data-tour={`nav-${item.to.slice(1)}`}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          if (location.pathname !== item.to) navigate(item.to);
        }}
        className={[
          "group relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-[color,background,transform] duration-200",
          within
            ? "bg-white/70 text-[var(--brand-text)] dark:bg-white/[0.06]"
            : "text-[var(--text-muted)] hover:translate-x-0.5 hover:bg-white/60 hover:text-[var(--text)] dark:hover:bg-white/5",
        ].join(" ")}
      >
        <Icon size={17} className="shrink-0 opacity-80" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          size={15}
          className={[
            "shrink-0 opacity-60 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open && (
        <div className="ml-[22px] mt-0.5 flex flex-col border-l border-[var(--divider)] pl-2.5">
          {children.map((child) => (
            <NavItemLink key={child.to} item={child} end={child.to === item.to} />
          ))}
        </div>
      )}
    </div>
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
            {openSection.items.map((item) =>
              item.children?.length ? (
                <NavItemGroup key={item.to} item={item} />
              ) : (
                <NavItemLink key={item.to} item={item} />
              ),
            )}
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
