import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

// One titled block inside the lead cockpit.
//
// Passed `fold`, it renders as a closed disclosure row instead. That is the
// phone: the sheet's job is dial, log the outcome, book, and everything else
// (tags, call history, notes, the hand-off) must not sit between the setter
// and the outcome buttons. Same content, one tap away. Desktop never folds,
// so the docked cockpit reads exactly as it always has.
export default function CockpitSection({
  title,
  meta,
  fold = false,
  children,
}: {
  title: ReactNode;
  // Small right-aligned count on the folded row ("2 dials"), so the setter can
  // see whether opening it is worth a tap.
  meta?: ReactNode;
  fold?: boolean;
  children: ReactNode;
}) {
  if (!fold) {
    return (
      <section className="border-t border-divider px-4 py-4 first:border-t-0">
        <h3 className="label-cap mb-2.5 flex items-center gap-1.5 text-faint">{title}</h3>
        {children}
      </section>
    );
  }

  return (
    <details className="group border-t border-divider">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[13.5px] font-semibold text-text [&::-webkit-details-marker]:hidden">
        <span className="flex flex-1 items-center gap-1.5">{title}</span>
        {meta && <span className="text-[12px] font-medium text-faint">{meta}</span>}
        <ChevronRight
          size={15}
          aria-hidden
          className="shrink-0 text-faint transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
