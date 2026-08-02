import { Link } from "react-router-dom";
import { LogOut, Moon, Settings as SettingsIcon, Sun, type LucideIcon } from "lucide-react";
import { NAV, flattenNav, filterNav } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useNavDataGates } from "../hooks/useNavDataGates";
import Shell from "../components/Shell";
import { PAGE_CONTAINER } from "../lib/layout";
import { groupAppTiles } from "../lib/appGrid";

// The phone "All features" grid: every live feature as a labelled tile, grouped
// the way a business owner thinks (win customers / sell / run the shop), plus an
// Account block. Driven off nav.ts by route, so it cannot drift from the real
// feature set, and permission-gated (staff without Team don't see that tile).
//
// This is the ONLY way a phone reaches anything outside the five-tab bottom bar,
// which is most of the app. The grouping itself lives in lib/appGrid.ts so
// appGrid.test.ts can assert full coverage without rendering React.

function Tile({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-2xl p-2 transition-colors active:bg-[var(--surface-2)]"
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl border"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border)",
          color: "var(--brand-text)",
        }}
      >
        <Icon size={23} strokeWidth={1.9} />
      </span>
      <span
        className="text-center text-[11px] leading-tight"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
    </Link>
  );
}

function GroupHeading({ children }: { children: string }) {
  return (
    <h2
      className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: "var(--text-faint)" }}
    >
      {children}
    </h2>
  );
}

// A full-width control row, for the account actions that are not pages. A tile
// would imply somewhere to go.
function ActionRow({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[14px] transition-colors active:bg-[var(--surface-2)]"
      style={{
        borderColor: "var(--border)",
        color: danger ? "var(--danger)" : "var(--text)",
      }}
    >
      <Icon size={19} strokeWidth={1.9} />
      {label}
    </button>
  );
}

export default function AllFeatures() {
  const { isOwner, can, session, signOut } = useAuth();
  const { resolved, toggle } = useTheme();
  const isLight = resolved === "light";
  const hasData = useNavDataGates(Boolean(session));

  // The same gate the sidebar and bottom bar use, so the grid can never offer a
  // tile the app would refuse to open.
  const visible = filterNav(flattenNav(NAV), { isOwner, can, hasData });
  const groups = groupAppTiles(visible);

  // Team is account administration, so it sits in the Account block beside
  // Settings, matching where the desktop sidebar puts it (its footer, not its
  // nav column). Settings is not a nav row at all, hence the literal route.
  const teamTile = visible.find((item) => item.to === "/team");

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <header className="pt-1">
          <h1
            className="font-display text-[26px] font-semibold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            All features
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Everything in your account, in one place.
          </p>
        </header>

        <div className="mt-6 flex flex-col gap-7 pb-28">
          {groups.map((group) => (
            <section key={group.label}>
              <GroupHeading>{group.label}</GroupHeading>
              <div className="grid grid-cols-3 gap-x-1 gap-y-3">
                {group.items.map((item) => (
                  <Tile key={item.to} to={item.to} label={item.label} icon={item.icon} />
                ))}
              </div>
            </section>
          ))}

          {/* Account. Before this block existed a phone had no way to reach
              Settings, change theme, or sign out at all: all three lived only in
              the desktop sidebar's footer, and that sidebar is lg-only. */}
          <section>
            <GroupHeading>Account</GroupHeading>
            <div className="grid grid-cols-3 gap-x-1 gap-y-3">
              <Tile to="/settings" label="Settings" icon={SettingsIcon} />
              {teamTile && <Tile to={teamTile.to} label={teamTile.label} icon={teamTile.icon} />}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <ActionRow
                icon={isLight ? Moon : Sun}
                label={isLight ? "Dark mode" : "Light mode"}
                onClick={toggle}
              />
              <ActionRow icon={LogOut} label="Sign out" onClick={() => void signOut()} danger />
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
