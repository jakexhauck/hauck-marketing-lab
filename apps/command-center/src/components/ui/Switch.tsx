import { cn } from "../../lib/cn";

// A small accessible on/off switch. Brand-filled when on, hairline track when
// off. Used by the notification channel toggles and per-employee SMS rows.
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[26px] w-[44px] shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50",
        checked ? "bg-brand" : "bg-[var(--surface-2)] border border-border",
      )}
      style={checked ? { backgroundImage: "var(--grad-brand)" } : undefined}
    >
      <span
        className={cn(
          "inline-block h-[20px] w-[20px] rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[20px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
