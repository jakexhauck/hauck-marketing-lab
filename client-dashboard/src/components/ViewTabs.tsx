import { useLocation, useNavigate } from "react-router-dom";

type Tab = {
  to: string;
  label: string;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    to: "/conversations",
    label: "Conversations",
    match: (p) => p.startsWith("/conversations"),
  },
  {
    to: "/contacts",
    label: "Contact Status",
    match: (p) => p.startsWith("/contacts"),
  },
  {
    to: "/dashboard",
    label: "Opportunities",
    match: (p) => p.startsWith("/dashboard") || p.startsWith("/lead/"),
  },
];

export default function ViewTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Primary views"
      className="sticky top-[57px] z-10 flex items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-5"
    >
      {TABS.map((tab) => {
        const active = tab.match(location.pathname);
        return (
          <button
            key={tab.to}
            type="button"
            onClick={() => {
              if (!active) navigate(tab.to);
            }}
            aria-current={active ? "page" : undefined}
            className={
              "relative flex h-11 items-center px-3 text-sm font-semibold transition-colors " +
              (active
                ? "text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]")
            }
          >
            <span>{tab.label}</span>
            {active && (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                style={{ backgroundColor: "var(--brand-primary)" }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
