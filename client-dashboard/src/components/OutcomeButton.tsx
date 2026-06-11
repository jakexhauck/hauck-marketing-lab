import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export type OutcomeVariant = "won" | "lost" | "move";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: OutcomeVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<OutcomeVariant, string> = {
  won: "bg-emerald-600 active:bg-emerald-700",
  lost: "bg-rose-600 active:bg-rose-700",
  move: "bg-slate-600 active:bg-slate-700",
};

export default function OutcomeButton({
  variant,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...rest}
      className={clsx(
        "inline-flex w-full items-center justify-center rounded-xl px-4 text-[13px] font-bold uppercase tracking-wider text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--text-faint)]",
        VARIANT_CLASSES[variant],
        className
      )}
      style={{ minHeight: "52px" }}
    >
      {children}
    </button>
  );
}
