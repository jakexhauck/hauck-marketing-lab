import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-fg hover:bg-brand-strong active:bg-brand-strong shadow-[var(--shadow-sm)]",
  secondary:
    "bg-surface border border-border-strong text-text hover:bg-surface-2 active:bg-surface-3",
  subtle: "bg-surface-2 text-text hover:bg-surface-3 border border-transparent",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-white hover:brightness-95 active:brightness-90",
};

// sm and icon grow to 40px below lg: at 32/36px they were under the touch
// guideline on a phone. Desktop sizes are unchanged.
const SIZES: Record<Size, string> = {
  sm: "h-10 px-3.5 text-[14px] gap-1.5 rounded-[var(--radius-sm)] lg:h-8 lg:px-3 lg:text-[13px]",
  md: "h-9.5 px-4 text-sm gap-2 rounded-[var(--radius)]",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-[var(--radius)]",
  icon: "h-10 w-10 justify-center rounded-[var(--radius-sm)] lg:h-9 lg:w-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium whitespace-nowrap",
        "transition-[transform,background-color,border-color,color,filter] duration-100 ease-out",
        "active:scale-[0.97] motion-reduce:active:scale-100",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={size === "sm" ? 14 : 16} className="animate-spin" />}
      {children}
    </button>
  );
});
