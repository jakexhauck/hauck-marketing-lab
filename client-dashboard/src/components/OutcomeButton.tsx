import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export type OutcomeVariant = "booked" | "won" | "lost" | "no-show";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: OutcomeVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<OutcomeVariant, string> = {
  booked: "bg-amber-500 active:bg-amber-600",
  won: "bg-emerald-600 active:bg-emerald-700",
  lost: "bg-rose-600 active:bg-rose-700",
  "no-show": "bg-slate-500 active:bg-slate-600",
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
        "inline-flex w-full items-center justify-center rounded-xl px-4 text-[13px] font-bold uppercase tracking-wider text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400",
        VARIANT_CLASSES[variant],
        className
      )}
      style={{ minHeight: "52px" }}
    >
      {children}
    </button>
  );
}
