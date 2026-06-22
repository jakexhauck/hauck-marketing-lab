import DesktopPage from "../../components/desktop/DesktopPage";
import { PLANS, PLAN_STATUS_LABEL, type PlanStatus } from "../../lib/plansData";

// Admin "Plans" — a read-only roadmap. Lists every plan we have right now with a
// short description and where it stands. Curated in lib/plansData.ts; this page
// just renders it. Admin-only (gated by AdminRoute).

const STATUS_CLS: Record<PlanStatus, string> = {
  planned: "bg-surface-2 text-muted",
  "in-progress": "bg-brand/10 text-brand",
  shipped: "bg-surface-2 text-faint",
};

export default function Plans() {
  const counts = PLANS.reduce(
    (acc, p) => {
      acc[p.status] += 1;
      return acc;
    },
    { planned: 0, "in-progress": 0, shipped: 0 } as Record<PlanStatus, number>,
  );

  return (
    <DesktopPage
      title="Plans"
      subtitle={`${counts.planned} planned · ${counts["in-progress"]} in progress · ${counts.shipped} shipped`}
    >
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        {PLANS.map((plan, idx) => (
          <div
            key={plan.title}
            className={[
              "flex flex-col gap-1.5 px-4 py-4 sm:flex-row sm:items-start sm:gap-4",
              idx === PLANS.length - 1 ? "" : "border-b border-divider",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-text">{plan.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{plan.description}</p>
            </div>
            <span
              className={[
                "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium",
                STATUS_CLS[plan.status],
              ].join(" ")}
            >
              {PLAN_STATUS_LABEL[plan.status]}
            </span>
          </div>
        ))}
      </div>
    </DesktopPage>
  );
}
