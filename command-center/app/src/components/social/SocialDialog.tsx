import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Shared overlay for the Social create flows. Centered modal on desktop, bottom
// sheet on mobile. Closes on backdrop click or Escape. The body scrolls; the
// header and (optional) footer stay pinned.
export default function SocialDialog({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = "sm:max-w-2xl",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  maxWidth?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-[var(--shadow-lg)] sm:rounded-2xl ${maxWidth}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[16px] text-text">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-faint">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-faint transition-colors hover:text-text"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <footer className="flex flex-col gap-3 border-t border-divider bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
