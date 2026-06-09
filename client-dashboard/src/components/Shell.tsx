import type { ReactNode } from "react";

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto flex min-h-dvh max-w-md flex-col bg-[var(--bg)]"
      style={{
        // Top safe-area is owned by each screen's top element (the navy hero
        // bleeds under the status bar). Only the bottom inset lives here.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {children}
    </div>
  );
}
