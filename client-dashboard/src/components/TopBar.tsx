import { Sliders } from "lucide-react";
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
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const month = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const canSeeSimulator = currentUser
    ? permissionsFor(currentUser.role).seeRevenue ||
      currentUser.role === "manager"
    : false;

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
      <BrandedLogo size="sm" />
      <div className="min-w-0 flex-1">
        <div className="label-cap truncate">{client.brand.appName}</div>
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
      <DevPanel />
    </header>
  );
}
