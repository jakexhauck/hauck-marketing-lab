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
        "inline-flex items-center justify-center rounded-xl px-5 py-3 text-[13px] font-semibold uppercase tracking-wider transition-[transform,box-shadow,background,border-color] duration-200 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "text-white shadow-brand hover:brightness-[1.04]",
        variant === "secondary" &&
          "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-[var(--shadow-md)]",
        className
      )}
      style={{
        minHeight: "52px",
        ...(variant === "primary"
          ? { backgroundImage: "var(--grad-brand)" }
          : undefined),
      }}
    >
      {children}
    </button>
  );
}
