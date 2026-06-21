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
        "inline-flex items-center justify-center rounded-xl px-4 py-3 text-[13px] font-bold uppercase tracking-wider transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "text-[var(--brand-fg)]",
        variant === "secondary" &&
          "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
        className
      )}
      style={{
        minHeight: "52px",
        ...(variant === "primary"
          ? { backgroundColor: "var(--brand-primary)" }
          : undefined),
      }}
    >
      {children}
    </button>
  );
}
