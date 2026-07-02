import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";

// The one responsive frame. Below lg it is the phone layout: a single centered
// column capped at max-w-md, with each screen rendering its own bottom tab bar.
// For authenticated sessions at lg+ it becomes the desktop layout: a persistent
// sidebar rail beside a wide, uncapped content column (the bottom bar hides
// itself at lg). The agency chat lives in the top-right ChatLauncher icon, so
// there is no docked right rail. The login screen also renders inside Shell, so
// the wide layout is gated on a session: unauthenticated, it stays the centered
// phone column.
export default function Shell({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const authed = Boolean(session);

  return (
    <div className={cn("min-h-dvh bg-[var(--bg)]", authed && "lg:flex")}>
      {authed && <Sidebar />}
      <div
        className={cn(
          // Below lg, pad ~64px (the fixed bottom tab bar's height) plus the
          // bottom safe-area inset so no page hides content behind the bar; the
          // desktop layout has no bar, so it drops the pad entirely (lg:pb-0).
          // Kept as one responsive class because an inline paddingBottom would
          // override the utility.
          "mx-auto flex min-h-dvh w-full max-w-md flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0",
          authed && "lg:mx-0 lg:max-w-none lg:min-w-0 lg:flex-1",
        )}
      >
        {children}
      </div>
      {authed && <BottomNav />}
    </div>
  );
}
