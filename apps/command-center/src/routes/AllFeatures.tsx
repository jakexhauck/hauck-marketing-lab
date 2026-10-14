import { Link } from "react-router-dom";
import {
  ChevronRight,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { NAV, flattenNav, filterNav } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useNavDataGates } from "../hooks/useNavDataGates";
import Shell from "../components/Shell";
import { PageHeader } from "../components/PageHeader";
import { PAGE_CONTAINER } from "../lib/layout";
import { groupAppTiles } from "../lib/appGrid";

// The phone "All features" list: every live feature as a full-width tappable
// row, grouped by product area (Marketing / Sales / Company) plus an Account
// block. Driven off nav.ts by route, so it cannot drift from the real feature
// set, and permission-gated (staff without Team don't see that row).
//
// This is the ONLY way a phone reaches anything outside the five-tab bottom
// bar, which is most of the app. The grouping itself lives in lib/appGrid.ts so
// appGrid.test.ts can assert full coverage without rendering React.
//
// Rows rather than the 3-across icon grid it used to be (Jake's call
// 2026-08-05). Eleven destinations in a 3-column grid needed 11px labels, gave
// each one a small square target, and still scrolled; as rows they are
// full-width taps at a readable size and the whole list fits in about a screen
// and a half.

// One row in a grouped block. `to` makes it a link; `onClick` makes it a
// button. Exactly one of the two, so a row that goes nowhere can never render
// with a chevron promising that it does.
function Row({
  icon: Icon,
  label,
  to,
  onClick,
  danger = false,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const inner = (
    <>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          background: danger ? "var(--danger-tint)" : "var(--surface-2)",
          color: danger ? "var(--danger)" : "var(--brand-text)",
        }}
      >
        <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span
        className="min-w-0 flex-1 truncate text-left text-[15px] font-medium"
        style={{ color: danger ? "var(--danger)" : "var(--text)" }}
      >
        {label}
      </span>
      {/* Only a row that navigates gets a chevron. Dark mode and Sign out act
          in place, so a chevron there would be a lie about what happens. */}
      {to && (
        <ChevronRight
          size={17}
          aria-hidden="true"
          className="shrink-0"
          style={{ color: "var(--text-faint)" }}
        />
      )}
    </>
  );

  // 56px tall: comfortably past the 44px iOS minimum, and tall enough that the
  // whole row reads as the target rather than just the label.
  const cls =
    "flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-[var(--surface-2)]" +
    (last ? "" : " border-b border-[var(--divider)]");

  if (to) {
    return (
      <Link to={to} className={cls} style={{ minHeight: 56 }}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={{ minHeight: 56 }}>
      {inner}
    </button>
  );
}

// A titled block of rows, as one bordered card so the group reads as a unit.
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </h2>
      <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)]">
        {children}
      </div>
    </section>
  );
}

export default function AllFeatures() {
  const { isOwner, can, session, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const isLight = resolved === "light";
  const hasData = useNavDataGates(Boolean(session));

  // The same gate the sidebar and bottom bar use, so the list can never offer a
  // row the app would refuse to open.
  const visible = filterNav(flattenNav(NAV), { isOwner, can, hasData });
  const groups = groupAppTiles(visible);

  // Team is account administration, so it sits in the Account block beside
  // Settings, matching where the desktop sidebar puts it (its footer, not its
  // nav column). Settings is not a nav row at all, hence the literal route.
  const teamRow = visible.find((item) => item.to === "/team");

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader title="All features" />

        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <Group key={group.label} label={group.label}>
              {group.items.map((item, i) => (
                <Row
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  last={i === group.items.length - 1}
                />
              ))}
            </Group>
          ))}

          {/* Account. Before this block existed a phone had no way to reach
              Settings, change theme, or sign out at all: all three lived only in
              the desktop sidebar's footer, and that sidebar is lg-only.
              Dark mode and Sign out sit in the same card as the two links, so
              the page has one visual language from top to bottom. */}
          <Group label="Account">
            <Row to="/settings" label="Settings" icon={SettingsIcon} />
            {teamRow && <Row to={teamRow.to} label={teamRow.label} icon={teamRow.icon} />}
            <Row
              icon={isLight ? Moon : Sun}
              label={isLight ? "Dark mode" : "Light mode"}
              onClick={toggle}
            />
            <Row icon={LogOut} label="Sign out" onClick={() => void signOut()} danger last />
          </Group>
        </div>
      </div>
    </Shell>
  );
}
