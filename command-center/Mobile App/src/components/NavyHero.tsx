import type { ReactNode } from "react";

// The shared "dark split" navy header block. Bleeds under the status bar
// (owns the top safe-area inset) and curves into the light content below.
// Used by every primary screen so the whole app reads as one product.
export default function NavyHero({
  children,
  rounded = true,
  flushTop = false,
  className = "",
}: {
  children: ReactNode;
  rounded?: boolean;
  // When something else already padded the top safe-area (e.g. the test
  // banner sits above the hero), skip the inset so we do not double-pad.
  flushTop?: boolean;
  className?: string;
}) {
  return (
    <header
      className={"relative overflow-hidden px-[22px] pb-6 text-white " + className}
      style={{
        background: "linear-gradient(165deg, #13294a 0%, #0d1f38 100%)",
        borderBottomLeftRadius: rounded ? 28 : 0,
        borderBottomRightRadius: rounded ? 28 : 0,
        paddingTop: flushTop
          ? "16px"
          : "calc(env(safe-area-inset-top) + 16px)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full"
        style={{ background: "rgba(255,255,255,0.05)" }}
      />
      <div className="relative">{children}</div>
    </header>
  );
}
