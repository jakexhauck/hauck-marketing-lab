import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../../../lib/cn";

// Shared pieces for the client setup pages built from the Client Setup SOP
// (Follow-up Texts, Custom Values, CAPI, the dialing script writer). Same card
// and type treatment as the Calendars panel so they read as one family.

export function SopCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("shrink-0 rounded-lg border border-border bg-surface p-5", className)}>
      {children}
    </section>
  );
}

export function SopHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-display text-[15px] font-semibold text-text">{children}</h3>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function SopButton({
  children,
  onClick,
  disabled,
  primary,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius)] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50",
        primary
          ? "border-brand bg-brand text-brand-fg hover:opacity-90"
          : "border-border bg-surface text-text hover:border-brand",
      )}
    >
      {children}
    </button>
  );
}

// Copies text and says so for a moment. Silent on a browser that refuses the
// clipboard: the text is on screen to select by hand.
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setDone(true), () => undefined);
      }}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-brand hover:text-text disabled:opacity-40"
    >
      {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

export const SOP_FIELD =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none";

export function SopError({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <p className="mt-2 text-[12.5px] text-danger">{msg || "That did not work."}</p>;
}
