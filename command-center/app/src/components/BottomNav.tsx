import { useLocation, useNavigate } from "react-router-dom";
import { NAV, bottomNavItems, filterNav } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "../hooks/useApi";
import { useNavDataGates } from "../hooks/useNavDataGates";
import { isInboxConversation } from "../lib/api";
import { haptic } from "../lib/haptics";

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isOwner, can, session } = useAuth();
  // The bar's surfaces in slot order, then only the ones this user may see. A
  // staff member missing a capability simply sees a shorter bar.
  const hasData = useNavDataGates(Boolean(session));
  const items = filterNav(bottomNavItems(NAV), { isOwner, can, hasData });
  // Active tab derives from the URL. Exact match, or nested underneath, EXCEPT
  // where another tab owns the nested route: Lead Tracker lives at
  // /marketing/paid-ads/leads, which is nested under the Ads tab's
  // /marketing/paid-ads, so a plain prefix test lights both. Same rule the
  // sidebar applies via needsExactMatch, kept local because the bar's tab set is
  // not the sidebar's.
  const matchesRoute = (to: string) => {
    if (pathname === to) return true;
    if (!pathname.startsWith(to + "/")) return false;
    return !items.some((other) => other.to !== to && other.to.startsWith(to + "/"));
  };
  // A page with no tab of its own (Meta Data, Creatives, Organic, Inbox,
  // Settings...) is reached through All features, so All lights for it.
  // Without this the bar showed nothing lit and the user lost their place.
  // Home and Notifications are the exceptions: Home is the front door and
  // Notifications opens from its bell, neither from All features.
  const ownedByTab = items.some((item) => item.to !== "/apps" && matchesRoute(item.to));
  const isActiveRoute = (to: string) =>
    to === "/apps" ? matchesRoute(to) || (!ownedByTab && pathname !== "/home" && pathname !== "/notifications") : matchesRoute(to);

  // Reuse the Conversations route's cached ["conversations"] query (same key +
  // fetcher) so this badge shares its data and 30s refetch cycle rather than
  // adding a new network dependency. When the user reads messages the query
  // refetches and the badge updates via react-query's cache subscription.
  // No data yet means no badge (we never fabricate a count).
  //
  // Gated on the Inbox tab actually being in the bar. It came out 2026-08-02, so
  // without this the app would keep polling every 30s on every phone page to
  // feed a badge that can no longer render. Re-slot Inbox in nav.ts and the poll
  // (and the badge) come back on their own.
  const hasInboxTab = items.some((item) => item.to === "/conversations");
  const conversations = useConversationsQuery(Boolean(session) && hasInboxTab);
  // Counts the Inbox, not the payload: the same feed also carries the client's
  // review-request chats for Reviews > Chats, and a badge on the Inbox tab that
  // included those would send them to a page where the unread is not.
  const unreadConversations = (conversations.data?.conversations ?? [])
    .filter(isInboxConversation)
    .reduce((n, c) => n + (c.unreadCount > 0 ? c.unreadCount : 0), 0);

  return (
    <nav
      aria-label="Primary"
      // Solid surface, not frosted glass. At 62% opacity the list behind the bar
      // showed through under the labels (names, prices, headings) on every
      // scrolling page, so the bar read as unfinished.
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-[var(--border)] bg-[var(--surface)] shadow-[0_-4px_16px_rgba(15,17,30,0.06)] lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* pt-2: the bar is a touch taller than it was, so the labels are not
          squeezed against the bar's top edge now that they are full-contrast. */}
      <div className="flex items-stretch pt-2">
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
              className="flex min-w-0 flex-1 flex-col items-center gap-1 pb-2.5 pt-0.5"
              // Inactive labels were --text-faint, which on the frosted bar read
              // as disabled rather than as "the other four pages". Full --text
              // contrast for the inactive ones, brand for the active one, so the
              // bar reads as five real destinations with one of them lit.
              style={{
                color: isActive ? "var(--brand-text)" : "var(--text)",
              }}
            >
              {isRaised ? (
                // Same 36px slot as the other four icons, with the FAB floating
                // out of it. The FAB used to sit in flow with -mt-6, which made
                // its slot 10px shorter than the rest and pushed the "All"
                // label above the other four labels.
                <span className="relative flex h-9 w-[52px] items-center justify-center">
                  <span
                    className="absolute left-1/2 top-[-18px] flex h-[46px] w-[46px] -translate-x-1/2 items-center justify-center rounded-2xl text-white transition-transform"
                    style={{
                      backgroundImage: "var(--grad-brand)",
                      boxShadow: "var(--shadow-brand)",
                    }}
                  >
                    <Icon size={24} strokeWidth={2.2} />
                  </span>
                </span>
              ) : (
                <span
                  className="flex h-9 w-[52px] items-center justify-center rounded-full transition-colors"
                  style={
                    isActive
                      ? { backgroundImage: "var(--grad-brand)", color: "#fff", boxShadow: "var(--shadow-brand)" }
                      : undefined
                  }
                >
                  <span className="relative flex items-center justify-center">
                    <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
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
              {/* One line, always. A label that wraps makes its tab taller than
                  the other four and the whole bar jumps. */}
              <span
                className="max-w-full truncate px-0.5 text-[12px] leading-none"
                style={{ fontWeight: isActive ? 700 : 600 }}
              >
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
