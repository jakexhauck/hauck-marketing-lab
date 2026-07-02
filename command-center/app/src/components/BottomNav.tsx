import { useLocation, useNavigate } from "react-router-dom";
import { NAV, filterNav, flattenNav } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "../hooks/useApi";
import { haptic } from "../lib/haptics";

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isOwner, can, session } = useAuth();
  // Only the bottom-bar surfaces, then only the ones this user may see.
  const items = filterNav(
    flattenNav(NAV).filter((item) => item.bottomNav),
    { isOwner, can },
  );
  // Active tab derives from the URL: exact match or a nested route under it.
  // Coming-soon pages sit under no tab, so nothing highlights there.
  const isActiveRoute = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  // Reuse the Conversations route's cached ["conversations"] query (same key +
  // fetcher) so this badge shares its data and 30s refetch cycle rather than
  // adding a new network dependency. When the user reads messages the query
  // refetches and the badge updates via react-query's cache subscription.
  // No data yet means no badge (we never fabricate a count).
  const conversations = useConversationsQuery(Boolean(session));
  const unreadConversations = (conversations.data?.conversations ?? []).reduce(
    (n, c) => n + (c.unreadCount > 0 ? c.unreadCount : 0),
    0,
  );

  return (
    <nav
      aria-label="Primary"
      className="glass fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-white/50 dark:border-white/10 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch pt-1.5">
        {items.map((item) => {
          const isActive = isActiveRoute(item.to);
          const Icon = item.icon;
          // iOS Mail-style unread pill on the Chats tab only. Cap large counts
          // at "9+" so the pill stays round and legible in the small bar.
          const showBadge =
            item.to === "/conversations" && unreadConversations > 0;
          const badgeText =
            unreadConversations > 9 ? "9+" : String(unreadConversations);
          // The "All features" launcher renders as a raised gradient FAB that
          // floats above the bar line, marking it as the primary phone action.
          const isRaised = item.to === "/apps";
          return (
            <button
              key={item.to}
              type="button"
              data-tour={`bottomnav-${item.to.slice(1)}`}
              onClick={() => {
                if (!isActive) {
                  haptic(10);
                  navigate(item.to);
                }
              }}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 pb-2 pt-0.5"
              style={{
                color: isActive ? "var(--brand-text)" : "var(--text-faint)",
              }}
            >
              {isRaised ? (
                <span
                  className="-mt-6 flex h-[46px] w-[46px] items-center justify-center rounded-2xl text-white transition-transform"
                  style={{
                    backgroundImage: "var(--grad-brand)",
                    boxShadow: "var(--shadow-brand)",
                  }}
                >
                  <Icon size={24} strokeWidth={2.2} />
                </span>
              ) : (
                <span
                  className="flex h-8 w-12 items-center justify-center rounded-full transition-colors"
                  style={
                    isActive
                      ? { backgroundImage: "var(--grad-brand)", color: "#fff", boxShadow: "var(--shadow-brand)" }
                      : undefined
                  }
                >
                  <span className="relative flex items-center justify-center">
                    <Icon size={21} strokeWidth={isActive ? 2.4 : 2} />
                    {showBadge && (
                      <span
                        aria-label={`${unreadConversations} unread conversations`}
                        className="absolute -right-2.5 -top-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
                        style={{
                          backgroundColor: "var(--brand-primary)",
                          boxShadow: "0 0 0 2px var(--surface)",
                        }}
                      >
                        {badgeText}
                      </span>
                    )}
                  </span>
                </span>
              )}
              <span className="text-[11px] font-semibold">
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
