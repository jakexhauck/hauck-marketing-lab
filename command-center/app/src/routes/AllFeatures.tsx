import { Link } from "react-router-dom";
import { NAV, flattenNav, filterNav, type NavItem } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import Shell from "../components/Shell";
import { PAGE_CONTAINER } from "../lib/layout";

// The phone "app grid": every live feature as a labelled tile, grouped the way a
// business owner thinks (win customers / sell / run the shop). It is driven off
// nav.ts by route, so it can never drift from the real feature set, and it is
// permission-gated (staff without Revenue/Team simply don't see those tiles).
// This is the phone entry point the simplified nav is otherwise missing for
// Paid Ads and Jobs.
const GROUPS: { label: string; routes: string[] }[] = [
  {
    label: "Get customers",
    routes: [
      "/marketing/paid-ads",
      // Back-burnered with their nav.ts rows; restore alongside them:
      //   "/marketing/reviews",
      //   "/marketing/website",
      //   "/marketing/reactivation",
    ],
  },
  {
    label: "Sell & book",
    routes: ["/sales/leads", "/sales/jobs"],
  },
  {
    label: "Run the business",
    routes: [
      "/conversations",
      "/contacts",
      "/team",
    ],
  },
];

export default function AllFeatures() {
  const { isOwner, can } = useAuth();
  // Only surfaces this user may see, keyed by route for the group lookups.
  const byRoute = new Map<string, NavItem>(
    filterNav(flattenNav(NAV), { isOwner, can }).map((item) => [item.to, item]),
  );

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
          {GROUPS.map((group) => {
            const items = group.routes
              .map((route) => byRoute.get(route))
              .filter((item): item is NavItem => Boolean(item));
            if (!items.length) return null;
            return (
              <section key={group.label}>
                <h2
                  className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {group.label}
                </h2>
                <div className="grid grid-cols-3 gap-x-1 gap-y-3">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
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
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
