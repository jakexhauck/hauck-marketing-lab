import { Sliders, FlaskConical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import { permissionsFor } from "../lib/rolePermissions";
import BrandedLogo from "./BrandedLogo";
import UserChip from "./UserChip";
import DevPanel from "./DevPanel";
import ThemeToggle from "./ThemeToggle";

export default function TopBar() {
  const { client } = useClient();
  const { currentUser, mode } = useAuth();
  const navigate = useNavigate();
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const canSeeSimulator = currentUser
    ? permissionsFor(currentUser.role).seeRevenue ||
      currentUser.role === "manager"
    : false;

  const isTest = mode === "test";

  return (
    <header className="sticky top-0 z-10">
      {isTest && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-500 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-white">
          <FlaskConical size={13} />
          Test account: staging data, not a live client
        </div>
      )}
      <div
        className={`flex items-center gap-3 border-b px-5 py-3 ${
          isTest
            ? "border-amber-400/60 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
            : "border-[var(--border)] bg-[var(--surface)]"
        }`}
      >
        <BrandedLogo size="sm" />
        <div className="min-w-0 flex-1">
          <span className="label-cap truncate">
            {isTest ? "Test Account" : client.brand.appName}
          </span>
          <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight text-[var(--text)]">
            {month}
          </div>
        </div>
        {canSeeSimulator && (
          <button
            type="button"
            onClick={() => navigate("/simulator")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Open what-if simulator"
          >
            <Sliders size={18} />
          </button>
        )}
        {currentUser && <UserChip user={currentUser} />}
        <ThemeToggle />
        {/* Dev-only: gated at the mount site so the panel (and the mock data
            it imports) is tree-shaken out of production bundles entirely. */}
        {import.meta.env.DEV && <DevPanel />}
      </div>
    </header>
  );
}
