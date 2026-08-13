import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import BrandedLogo from "./BrandedLogo";
import UserChip from "./UserChip";
import DevPanel from "./DevPanel";
import ThemeToggle from "./ThemeToggle";

export default function TopBar() {
  const { client } = useClient();
  const { currentUser, mode } = useAuth();
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const isTest = mode === "test";

  return (
    <header className="sticky top-0 z-10">
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <BrandedLogo size="sm" />
        <div className="min-w-0 flex-1">
          <span className="label-cap truncate">
            {isTest ? "Made Better Landscaping Co" : client.brand.appName}
          </span>
          <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight text-[var(--text)]">
            {month}
          </div>
        </div>
        {currentUser && <UserChip user={currentUser} />}
        <ThemeToggle />
        {/* Dev-only: gated at the mount site so the panel (and the mock data
            it imports) is tree-shaken out of production bundles entirely. */}
        {import.meta.env.DEV && <DevPanel />}
      </div>
    </header>
  );
}
