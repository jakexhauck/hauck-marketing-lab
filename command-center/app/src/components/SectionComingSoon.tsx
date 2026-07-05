import Shell from "./Shell";
import PageBar from "./PageBar";
import { Sparkles } from "lucide-react";
import { PAGE_CONTAINER } from "../lib/layout";
import type { PageTab } from "../lib/pageTabs";

// In-section "in the works" placeholder: renders the section's PageBar tab row
// (so the tabs stay navigable) over a centered coming-soon card. Used by the
// scaffolded skeleton pages until the real content is built.
export default function SectionComingSoon({
  tabs,
  title,
  blurb = "This is in the works. We'll switch it on when it's ready.",
}: {
  tabs: PageTab[];
  title: string;
  blurb?: string;
}) {
  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar tabs={tabs} />
        <div className="flex min-h-[55vh] items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
              style={{ backgroundImage: "var(--grad-brand)" }}
            >
              <Sparkles size={24} aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-[20px] font-bold text-[var(--text)]">{title}</h2>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                In the works
              </div>
            </div>
            <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{blurb}</p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
