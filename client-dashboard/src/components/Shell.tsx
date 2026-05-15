import type { ReactNode } from "react";

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto flex min-h-dvh max-w-md flex-col bg-[var(--bg)]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {children}
    </div>
  );
}
