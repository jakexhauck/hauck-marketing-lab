import { cn } from "../../lib/cn";

// A small presence indicator. Online is decided by the caller (via isOnline against
// the ChatContext presentIds set), so this stays purely presentational.
export default function PresenceDot({
  online,
  className,
}: {
  online: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full ring-2", className)}
      style={{
        background: online ? "var(--brand-primary)" : "var(--text-faint)",
        // Ring blends the dot into whatever surface it sits on (avatar corner, row).
        "--tw-ring-color": "var(--surface)",
      } as React.CSSProperties}
      title={online ? "Online" : "Offline"}
      aria-label={online ? "Online" : "Offline"}
    />
  );
}
