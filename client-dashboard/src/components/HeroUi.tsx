import type { ReactNode } from "react";

// Small building blocks shared by every navy hero so the brand mark, action
// buttons, and split-metric block look identical across the app.

export function HeroMark({ initials }: { initials: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white font-display text-[13px] font-extrabold"
      style={{ color: "#13294a" }}
    >
      {initials}
    </div>
  );
}

export function HeroIconButton({
  children,
  label,
  onClick,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-colors active:scale-[0.96]"
      style={{ background: "rgba(255,255,255,0.14)" }}
    >
      {children}
    </button>
  );
}

const CAP_LIGHT =
  "text-[12px] font-semibold uppercase tracking-[0.06em] text-white/60";

// The signature "dark split" metric block: a giant primary number on the left
// and a light-blue accent figure on the right, divided by a hairline.
export default function SplitHero({
  primaryLabel,
  primaryValue,
  accentValue,
  accentLabel,
  primarySize = 56,
}: {
  primaryLabel: string;
  primaryValue: string | number;
  accentValue: string | number;
  accentLabel: string;
  primarySize?: number;
}) {
  return (
    <div className="mt-7 flex items-end gap-5">
      <div className="min-w-0 flex-1">
        <div className={CAP_LIGHT}>{primaryLabel}</div>
        <div
          className="mt-1.5 font-display text-white"
          style={{
            fontSize: primarySize,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 0.95,
          }}
        >
          {primaryValue}
        </div>
      </div>
      <div
        className="h-12 w-px shrink-0"
        style={{ background: "rgba(255,255,255,0.14)" }}
      />
      <div className="shrink-0 pb-1 text-right">
        <div
          className="font-display"
          style={{
            fontSize: 30,
            fontWeight: 900,
            color: "#5b9be0",
            letterSpacing: "-0.03em",
            lineHeight: 0.95,
          }}
        >
          {accentValue}
        </div>
        <div className={CAP_LIGHT + " mt-1"}>{accentLabel}</div>
      </div>
    </div>
  );
}
