import { useNavigate } from "react-router-dom";
import { NAV, filterNav } from "../lib/nav";
import { useAuth } from "../context/AuthContext";

// The four day-to-day surfaces map 1:1 to the bottom-bar tabs. Screens still
// pass which one is active by key; we resolve that to a route via this map so
// the bar shares the unified nav source of truth (and its permission gate)
// with the desktop sidebar.
export type NavKey = "home" | "leads" | "conversations" | "contacts" | "comms";

const ROUTE_BY_KEY: Record<NavKey, string> = {
  home: "/home",
  leads: "/leads",
  conversations: "/conversations",
  contacts: "/contacts",
  comms: "/comms",
};

export default function BottomNav({ active }: { active: NavKey }) {
  const navigate = useNavigate();
  const { isOwner, can } = useAuth();
  // Only the bottom-bar surfaces, then only the ones this user may see.
  const items = filterNav(
    NAV.filter((item) => item.bottomNav),
    { isOwner, can },
  );
  const activeRoute = ROUTE_BY_KEY[active];

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-[var(--border)] bg-[var(--surface)] lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch pt-1.5">
        {items.map((item) => {
          const isActive = item.to === activeRoute;
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              type="button"
              data-tour={`bottomnav-${item.to.slice(1)}`}
              onClick={() => {
                if (!isActive) navigate(item.to);
              }}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 pb-2 pt-0.5"
              style={{
                color: isActive
                  ? "var(--brand-primary)"
                  : "var(--text-faint)",
              }}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10.5px] font-semibold">
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
