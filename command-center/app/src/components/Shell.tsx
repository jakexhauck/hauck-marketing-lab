import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import RightRail from "./comms/RightRail";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/cn";

// The one responsive frame. Below lg it is the phone layout: a single centered
// column capped at max-w-md, with each screen rendering its own bottom tab bar.
// For authenticated sessions at lg+ it becomes the desktop layout: a persistent
// sidebar rail beside a wide, uncapped content column (the bottom bar hides
// itself at lg). The login screen also renders inside Shell, so the wide layout
// is gated on a session: unauthenticated, it stays the centered phone column.
export default function Shell({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const authed = Boolean(session);

  return (
    <div className={cn("min-h-dvh bg-[var(--bg)]", authed && "lg:flex")}>
      {authed && <Sidebar />}
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full max-w-md flex-col",
          authed && "lg:mx-0 lg:max-w-none lg:min-w-0 lg:flex-1",
        )}
        style={{
          // Top safe-area is owned by each screen's top element (the navy hero
          // bleeds under the status bar). Only the bottom inset lives here.
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </div>
      {authed && <RightRail />}
    </div>
  );
}
