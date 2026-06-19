import { APP_BRAND } from "../lib/appBrand";
import { useAuth } from "../context/AuthContext";

// Clean client-facing header: brand chip + app name, with an optional subtitle.
// Replaces the operator-oriented TopBar on the client tabs.
export default function AppHeader({ subtitle }: { subtitle?: string }) {
  const { mode } = useAuth();
  const isTest = mode === "test";

  return (
    <div className="sticky top-0 z-10">
      {isTest && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-white">
          Test account
        </div>
      )}
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-[12px] font-extrabold text-white"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          {APP_BRAND.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[17px] font-bold tracking-tight text-[var(--text)]">
            {APP_BRAND.appName}
          </div>
          {subtitle && (
            <div className="truncate text-xs text-[var(--text-muted)]">
              {subtitle}
            </div>
          )}
        </div>
      </header>
    </div>
  );
}
