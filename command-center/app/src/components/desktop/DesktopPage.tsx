import type { ReactNode } from "react";

// Shared chrome for every client desktop (lg+) surface: a sticky header with
// title, optional subtitle and actions, above a max-width content container.
// Keeps the Atelier command-deck layout identical across pages.
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
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-bold leading-tight text-text">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        )}
      </header>
      <div className="mx-auto w-full max-w-[1400px] px-8 py-7">{children}</div>
    </div>
  );
}
