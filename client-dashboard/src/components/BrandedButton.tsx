import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  children: ReactNode;
}

export default function BrandedButton({
  variant = "primary",
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-semibold transition-opacity active:opacity-80 disabled:opacity-50",
        variant === "primary" && "text-white shadow-sm",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-900",
        className
      )}
      style={
        variant === "primary"
          ? { backgroundColor: "var(--brand-primary)" }
          : undefined
      }
    >
      {children}
    </button>
  );
}
