import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import NotificationBell from "../NotificationBell";
import GlobalSearch from "./GlobalSearch";
import AvatarMenu from "./AvatarMenu";

// Shared chrome for every client desktop (lg+) surface: the Modern Motion kit's
// merged glass topbar. Page title (and optional subtitle) on the left; the
// global controls (search, page actions, notifications, account menu) on the
// right. The bell is rendered here once, so pages no longer pass it in actions.
export default function DesktopPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { session } = useAuth();
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="glass sticky top-0 z-10 flex items-center gap-4 border-b border-white/50 px-9 py-4 dark:border-white/10">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-bold leading-tight text-text">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        <GlobalSearch />
        {actions && (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        )}
        <NotificationBell enabled={Boolean(session)} variant="surface" />
        <AvatarMenu />
      </header>
      <div className="fx-rise mx-auto w-full max-w-[1220px] px-9 py-7">
        {children}
      </div>
    </div>
  );
}
