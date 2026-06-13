import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[2px] animate-[overlayIn_.15s_ease-out]"
      onClick={onClose}
      aria-hidden
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEscape(onClose);
  if (!open) return null;
  return createPortal(
    <>
      <Backdrop onClose={onClose} />
      <div className="fixed inset-0 z-[81] flex items-center justify-center p-4" role="dialog" aria-modal>
        <div
          className={cn(
            "w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)] animate-[paletteIn_.18s_ease-out]",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
              <h2 className="font-display text-base text-text">{title}</h2>
              <button onClick={onClose} className="rounded p-1 text-faint hover:bg-surface-2 hover:text-text" aria-label="Close">
                <X size={17} />
              </button>
            </div>
          )}
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-divider bg-surface-2/40 px-5 py-3">{footer}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}

// Right-hand drawer for detail surfaces (lead, conversation) that should keep
// the list context visible behind them.
export function Drawer({
  open,
  onClose,
  children,
  width = "max-w-xl",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  className?: string;
}) {
  useEscape(onClose);
  if (!open) return null;
  return createPortal(
    <>
      <Backdrop onClose={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cn(
          "fixed inset-y-0 right-0 z-[81] flex w-full flex-col border-l border-border bg-surface shadow-[var(--shadow-lg)]",
          "animate-[paletteIn_.2s_ease-out]",
          width,
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
